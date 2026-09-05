use crate::xml::AttrStr;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use anyhow::Result;
use tokio_xmpp::jid::Jid;
use tokio_xmpp::minidom::Element;
use tokio_xmpp::parsers::data_forms::{DataForm, DataFormType, Field, FieldType};
use tokio_xmpp::parsers::iq::Iq;
use tokio_xmpp::parsers::muc::Muc;
use tokio_xmpp::parsers::muc::muc::History;
use tokio_xmpp::parsers::presence::Presence;
use tokio_xmpp::parsers::stanza::Stanza;
use tokio_xmpp::parsers::stanza_error::DefinedCondition;
use tracing::{info, warn};

use crate::session::{Session, condition_of};
use crate::store::{Affiliation, Channel, Guild};

const NS_MUC_OWNER: &str = "http://jabber.org/protocol/muc#owner";
const NS_MUC_ADMIN: &str = "http://jabber.org/protocol/muc#admin";

fn room_config(name: &str, public: bool) -> DataForm {
    let boolean = |var: &str, on: bool| {
        Field::new(var, FieldType::Boolean).with_value(if on { "1" } else { "0" })
    };
    DataForm::new(
        DataFormType::Submit,
        "http://jabber.org/protocol/muc#roomconfig",
        vec![
            Field::text_single("muc#roomconfig_roomname", name),
            boolean("muc#roomconfig_persistentroom", true),
            boolean("muc#roomconfig_publicroom", public),
            boolean("muc#roomconfig_membersonly", !public),
            Field::text_single("muc#roomconfig_whois", "anyone"),
            boolean("muc#roomconfig_enablearchiving", true),
            boolean("muc#roomconfig_allowinvites", false),
            boolean("muc#roomconfig_changesubject", false),
        ],
    )
}

fn owner_iq(session: &Session, room: &str, query: Element) -> Result<Iq> {
    Ok(Iq::Set {
        from: Some(Jid::new(&session.instance.actor())?),
        to: Some(Jid::new(room)?),
        id: session.next_id(),
        payload: query,
    })
}

async fn join(session: &Session, room: &str) -> Result<()> {
    let occupant = Jid::new(&format!("{room}/vcd"))?;
    let presence = Presence::available()
        .with_from(Jid::new(&session.instance.actor())?)
        .with_to(occupant)
        .with_payload(Muc::new().with_history(History::new().with_maxstanzas(0)));
    session.send(Stanza::Presence(presence)).await;
    Ok(())
}

async fn leave(session: &Session, room: &str) -> Result<()> {
    let occupant = Jid::new(&format!("{room}/vcd"))?;
    let presence = Presence::unavailable()
        .with_from(Jid::new(&session.instance.actor())?)
        .with_to(occupant);
    session.send(Stanza::Presence(presence)).await;
    Ok(())
}

/// Create the room if needed, apply the profile's configuration, and set every member's affiliation.
pub async fn ensure_room(session: &Session, guild: &Guild, channel: &Channel) -> Result<()> {
    join(session, &channel.jid).await?;
    let form: Element =
        room_config(&format!("{} / {}", guild.name, channel.name), guild.public).into();
    let query = Element::builder("query", NS_MUC_OWNER).append(form).build();
    session
        .request(owner_iq(session, &channel.jid, query)?)
        .await?;
    for (jid, affiliation) in &guild.members {
        set_affiliation(session, &channel.jid, jid, Some(*affiliation)).await?;
    }
    leave(session, &channel.jid).await?;
    info!(room = %channel.jid, "room ready");
    Ok(())
}

/// Set or, with `None`, remove one JID's affiliation on one room.
pub async fn set_affiliation(
    session: &Session,
    room: &str,
    jid: &str,
    affiliation: Option<Affiliation>,
) -> Result<()> {
    let value = affiliation.map(Affiliation::as_str).unwrap_or("none");
    let item = Element::builder("item", NS_MUC_ADMIN)
        .attr_str("jid", jid)
        .attr_str("affiliation", value)
        .build();
    let query = Element::builder("query", NS_MUC_ADMIN).append(item).build();
    session.request(owner_iq(session, room, query)?).await?;
    Ok(())
}

/// Apply one affiliation change to every room of the guild.
pub async fn sync_member(
    session: &Session,
    guild: &Guild,
    jid: &str,
    affiliation: Option<Affiliation>,
) -> Result<()> {
    for channel in guild.channels() {
        set_affiliation(session, &channel.jid, jid, affiliation).await?;
    }
    Ok(())
}

pub async fn destroy_room(session: &Session, room: &str) -> Result<()> {
    let destroy = Element::builder("destroy", NS_MUC_OWNER).build();
    let query = Element::builder("query", NS_MUC_OWNER)
        .append(destroy)
        .build();
    match session.request(owner_iq(session, room, query)?).await {
        Ok(_) => {
            info!(room, "room destroyed");
            Ok(())
        }
        Err(err) if condition_of(&err) == Some(&DefinedCondition::ItemNotFound) => Ok(()),
        Err(err) => Err(err),
    }
}

pub async fn handle_presence(session: &Arc<Session>, presence: Presence) {
    track_presence(session, &presence).await;
    if presence.type_ == tokio_xmpp::parsers::presence::Type::Error {
        warn!(from = ?presence.from, "presence error");
    }
}

const NS_MUC_USER: &str = "http://jabber.org/protocol/muc#user";
const NS_MUJI: &str = "urn:xmpp:jingle:muji:0";

/// Who is in each voice room and whether they are in its call, from the presence the daemon
/// sees as a permanent occupant. Keyed by full JID: one account can have several devices in
/// the room, and only the device that joined the call may publish media.
#[derive(Default)]
pub struct VoiceRooms {
    occupants: Mutex<HashMap<String, HashMap<String, bool>>>,
}

impl VoiceRooms {
    pub fn in_call(&self, room: &str, full: &str) -> bool {
        self.occupants
            .lock()
            .expect("occupants lock")
            .get(room)
            .and_then(|room| room.get(full))
            .copied()
            .unwrap_or(false)
    }

    /// Returns the previous in-call state, so callers see a leave.
    fn set(&self, room: &str, full: &str, in_call: Option<bool>) -> bool {
        let mut rooms = self.occupants.lock().expect("occupants lock");
        let entry = rooms.entry(room.to_string()).or_default();
        match in_call {
            Some(value) => entry.insert(full.to_string(), value).unwrap_or(false),
            None => entry.remove(full).unwrap_or(false),
        }
    }
}

/// Join and stay, so presence keeps flowing. Used for voice rooms.
pub async fn stay(session: &Session, room: &str) -> Result<()> {
    join(session, room).await
}

pub async fn track_presence(session: &Arc<Session>, presence: &Presence) {
    let Some(from) = presence.from.as_ref() else {
        return;
    };
    let room = from.to_bare().to_string();
    if !room.ends_with(&format!("@{}", session.instance.rooms)) {
        return;
    }
    let Some(nick) = from.resource().map(|r| r.to_string()) else {
        return;
    };
    if nick == "vcd" {
        return;
    }
    // Several devices of one account share a nick, and the room then lists one item per device.
    // Each is a full JID that may publish on its own, so every one of them has to be tracked.
    let reals: Vec<String> = presence
        .payloads
        .iter()
        .filter(|p| p.is("x", NS_MUC_USER))
        .flat_map(|x| x.children().filter(|c| c.is("item", NS_MUC_USER)))
        .filter_map(|item| item.attr("jid"))
        .map(|jid| jid.to_string())
        .collect();
    let unavailable = presence.type_ == tokio_xmpp::parsers::presence::Type::Unavailable;
    let in_call = presence.payloads.iter().any(|p| p.is("muji", NS_MUJI));
    tracing::debug!(room, nick, ?reals, in_call, unavailable, "room presence");
    for full in reals {
        let was_in_call = session.instance.voice.set(
            &room,
            &full,
            if unavailable { None } else { Some(in_call) },
        );
        if was_in_call && (unavailable || !in_call) {
            crate::conference::on_left_call(session, &room, &full).await;
        } else if !was_in_call && !unavailable && in_call {
            crate::conference::on_joined_call(session, &room, &full).await;
        }
    }
}
