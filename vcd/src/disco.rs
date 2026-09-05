use std::collections::BTreeSet;

use anyhow::Result;
use tokio_xmpp::jid::Jid;
use tokio_xmpp::minidom::Element;
use tokio_xmpp::parsers::disco::{
    DiscoInfoQuery, DiscoInfoResult, DiscoItemsQuery, DiscoItemsResult, Identity, Item,
};
use tokio_xmpp::parsers::iq::Iq;
use tokio_xmpp::parsers::ns;
use tokio_xmpp::parsers::stanza_error::{DefinedCondition, ErrorType};

use crate::commands::{COMMANDS, NS_COMMANDS};
use crate::manifest::NS_GUILD;
use crate::session::{Session, stanza_error};

pub async fn handle_get(session: &Session, iq: &Iq, payload: &Element) -> Result<Option<Iq>> {
    if payload.is("query", ns::DISCO_INFO) {
        let query = DiscoInfoQuery::try_from(payload.clone())?;
        let result = match iq.to().and_then(|to| to.node()) {
            Some(_) => conference_info(),
            None => info(query.node.as_deref())?,
        };
        return Ok(Some(Iq::from_result(iq.id(), Some(result))));
    }
    if payload.is("query", ns::DISCO_ITEMS) {
        let query = DiscoItemsQuery::try_from(payload.clone())?;
        return Ok(Some(Iq::from_result(
            iq.id(),
            Some(items(session, iq.from(), query.node.as_deref())?),
        )));
    }
    Err(stanza_error(
        ErrorType::Cancel,
        DefinedCondition::ServiceUnavailable,
        "unsupported request",
    ))
}

/// A voice channel's conference JID, per the Jingle A/V Conferences ProtoXEP.
fn conference_info() -> DiscoInfoResult {
    let features = [
        ns::DISCO_INFO,
        crate::conference::NS_AV_CONFERENCES,
        crate::sdp_jingle::NS_JINGLE,
        crate::sdp_jingle::NS_RTP,
        "urn:xmpp:jingle:apps:rtp:audio",
        "urn:xmpp:jingle:apps:rtp:video",
        crate::sdp_jingle::NS_ICE_UDP,
        crate::sdp_jingle::NS_DTLS,
    ];
    DiscoInfoResult {
        node: None,
        identities: vec![Identity::new(
            "conference",
            "audio-video",
            "en",
            "voice channel",
        )],
        features: features.iter().map(|f| f.to_string()).collect(),
        extensions: vec![],
    }
}

fn info(node: Option<&str>) -> Result<DiscoInfoResult> {
    let mut features = BTreeSet::new();
    features.insert(ns::DISCO_INFO.to_string());
    features.insert(ns::DISCO_ITEMS.to_string());
    let identities = match node {
        None => {
            features.insert(NS_COMMANDS.to_string());
            features.insert(NS_GUILD.to_string());
            vec![Identity::new("component", "generic", "en", "voice.channel")]
        }
        Some(node) => {
            let command = COMMANDS
                .iter()
                .find(|command| command.node == node)
                .ok_or_else(|| {
                    stanza_error(
                        ErrorType::Cancel,
                        DefinedCondition::ItemNotFound,
                        "no such node",
                    )
                })?;
            features.insert(NS_COMMANDS.to_string());
            features.insert(ns::DATA_FORMS.to_string());
            vec![Identity::new(
                "automation",
                "command-node",
                "en",
                command.name,
            )]
        }
    };
    Ok(DiscoInfoResult {
        node: node.map(str::to_string),
        identities,
        features,
        extensions: vec![],
    })
}

/// XEP-0050 says to list only the commands the requester may run. That is also how a
/// client learns whether it is an instance admin.
fn items(session: &Session, from: Option<&Jid>, node: Option<&str>) -> Result<DiscoItemsResult> {
    let bare = from
        .map(|jid| jid.to_bare().to_string())
        .unwrap_or_default();
    let is_admin = session.instance.admins.contains(&bare);
    let items = match node {
        Some(NS_COMMANDS) => COMMANDS
            .iter()
            .filter(|command| is_admin || !crate::commands::admin_only(command.node))
            .map(|command| {
                Ok(Item {
                    jid: Jid::new(&session.instance.component)?,
                    node: Some(command.node.to_string()),
                    name: Some(command.name.to_string()),
                })
            })
            .collect::<Result<Vec<_>>>()?,
        _ => vec![],
    };
    Ok(DiscoItemsResult {
        node: node.map(str::to_string),
        items,
        rsm: None,
    })
}
