//! The conference service: Jingle Audio/Video Conferences (ProtoXEP) on one side, Galene on
//! the other. Each stream a participant publishes is one Jingle session from them to us;
//! every stream we deliver is one Jingle session from us to them, as the ProtoXEP describes.

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

use anyhow::{Result, anyhow};
use serde_json::Value;
use tokio::sync::mpsc;
use tokio_xmpp::jid::Jid;
use tokio_xmpp::minidom::Element;
use tokio_xmpp::parsers::iq::Iq;
use tokio_xmpp::parsers::stanza_error::{DefinedCondition, ErrorType};
use tracing::{info, warn};

use crate::galene::{GaleneClient, GaleneEvent};
use crate::sdp_jingle::{self, NS_JINGLE, Role};
use crate::session::{Session, stanza_error};
use crate::xml::AttrStr;

pub const NS_AV_CONFERENCES: &str = "urn:xmpp:jingle:av-conferences:0";
const NS_COIN: &str = "urn:xmpp:coin:1";
const GALENE_PASSWORD: &str = "voice.channel";
/// A client marks a screen share by this session id prefix; Galene labels the stream apart.
const SCREEN_SID_PREFIX: &str = "screen-";

/// Every participant of every conference this daemon serves, keyed by full JID.
#[derive(Default)]
pub struct Conferences {
    registry: Mutex<Registry>,
}

/// Held under one lock so that a candidate cannot be dropped between the lookup that misses
/// and the insert that would have served it.
#[derive(Default)]
struct Registry {
    participants: HashMap<String, Arc<Participant>>,
    /// Candidates that arrived before the participant existed at all, by full JID and Galene
    /// stream id. Handed to the participant once it is registered.
    early: HashMap<String, Vec<(String, Value)>>,
}

/// A client trickles a handful of candidates per stream. Anything past this is not a client
/// waiting on a stream of its own.
const MAX_PENDING_CANDIDATES: usize = 32;

struct Participant {
    jid: String,
    conference: String,
    room: String,
    galene: GaleneClient,
    streams: Mutex<Streams>,
}

/// One lock, because whether a candidate may go out depends on whether Galene has been told
/// about its stream yet, and the answer must not change between the test and the send.
#[derive(Default)]
struct Streams {
    /// Streams this participant sends us, by session id. Present once Galene has the offer.
    up: HashSet<String>,
    /// Streams we send them: Galene stream id to session id.
    down: HashMap<String, String>,
    /// Candidates for a stream Galene does not know yet, by Galene stream id.
    pending: HashMap<String, Vec<Value>>,
}

impl Participant {
    fn group(&self) -> String {
        format!("vc/{}", self.conference.split('@').next().unwrap_or(""))
    }

    fn down_sid(&self, stream_id: &str) -> Option<String> {
        self.streams
            .lock()
            .expect("streams lock")
            .down
            .get(stream_id)
            .cloned()
    }

    /// Hand the candidate back when Galene already knows the stream, otherwise hold it: Galene
    /// discards a candidate for a stream it has not been offered.
    fn route_candidate(&self, stream: &str, candidate: Value) -> Option<Value> {
        let mut streams = self.streams.lock().expect("streams lock");
        if streams.up.contains(stream) || streams.down.contains_key(stream) {
            return Some(candidate);
        }
        let held = streams.pending.entry(stream.to_string()).or_default();
        if held.len() < MAX_PENDING_CANDIDATES {
            held.push(candidate);
        }
        None
    }

    /// Galene now has this stream: take the candidates that arrived before its offer did.
    fn released(&self, stream: &str) -> Vec<Value> {
        self.streams
            .lock()
            .expect("streams lock")
            .pending
            .remove(stream)
            .unwrap_or_default()
    }
}

/// Session ids for streams we deliver carry the owner, so a client can attribute the stream
/// without parsing Coin: `<galene stream id>~<owner bare jid>`.
fn down_session_id(stream_id: &str, owner: &str) -> String {
    format!("{stream_id}~{owner}")
}

/// Galene stream id of a down session, which is the part before the owner marker.
fn stream_id_of(sid: &str) -> &str {
    sid.split('~').next().unwrap_or(sid)
}

fn action_of(jingle: &Element) -> &str {
    jingle.attr("action").unwrap_or("")
}

fn sid_of(jingle: &Element) -> Result<String> {
    jingle
        .attr("sid")
        .map(str::to_string)
        .ok_or_else(|| anyhow!("jingle without sid"))
}

fn conference_parts(session: &Session, iq: &Iq) -> Result<(String, String, String)> {
    let to = iq.to().ok_or_else(|| anyhow!("iq without to"))?;
    let node = to.node().map(|n| n.to_string()).ok_or_else(|| {
        stanza_error(
            ErrorType::Cancel,
            DefinedCondition::ItemNotFound,
            "no such conference",
        )
    })?;
    let conference = format!("{node}@{}", session.instance.component);
    let room = format!("{node}@{}", session.instance.rooms);
    let from = iq
        .from()
        .ok_or_else(|| anyhow!("iq without from"))?
        .to_string();
    Ok((conference, room, from))
}

fn ok(iq: &Iq) -> Option<Iq> {
    Some(Iq::empty_result(
        iq.from().cloned().expect("from checked"),
        iq.id(),
    ))
}

pub async fn handle_jingle(
    session: &Arc<Session>,
    iq: &Iq,
    jingle: &Element,
) -> Result<Option<Iq>> {
    let (conference, room, from) = conference_parts(session, iq)?;
    let sid = sid_of(jingle)?;
    let conferences = &session.instance.conferences;
    let unknown = || {
        stanza_error(
            ErrorType::Cancel,
            DefinedCondition::ItemNotFound,
            "unknown session",
        )
    };

    match action_of(jingle) {
        "session-initiate" => {
            if !session.instance.voice.in_call(&room, &from) {
                return Err(stanza_error(
                    ErrorType::Auth,
                    DefinedCondition::Forbidden,
                    "join the room's call first",
                ));
            }
            let participant =
                ensure_participant(session, conferences, &from, &conference, &room).await?;
            let sdp = sdp_jingle::jingle_to_sdp(jingle, Role::Initiator)?;
            let label = if sid.starts_with(SCREEN_SID_PREFIX) {
                "screenshare"
            } else {
                "camera"
            };
            participant.galene.offer(&sid, label, &sdp).await?;
            participant
                .streams
                .lock()
                .expect("streams lock")
                .up
                .insert(sid.clone());
            for candidate in participant.released(&sid) {
                participant.galene.ice(&sid, candidate).await?;
            }
            info!(participant = %from, room, label, "publishing stream");
            Ok(ok(iq))
        }
        "session-accept" => {
            let participant = conferences.get(&from).ok_or_else(unknown)?;
            let sdp = sdp_jingle::jingle_to_sdp(jingle, Role::Responder)?;
            participant.galene.answer(stream_id_of(&sid), &sdp).await?;
            Ok(ok(iq))
        }
        "transport-info" => {
            let stream = stream_id_of(&sid);
            for content in jingle.children().filter(|c| c.is("content", NS_JINGLE)) {
                let Some(candidate) = sdp_jingle::jingle_candidate_to_ice(content) else {
                    continue;
                };
                // A client trickles its first candidate within a millisecond of the
                // session-initiate, so the stream it names is routinely not offered yet.
                if let Some((participant, candidate)) = conferences.route(&from, stream, candidate)
                    && let Some(candidate) = participant.route_candidate(stream, candidate)
                {
                    participant.galene.ice(stream, candidate).await?;
                }
            }
            Ok(ok(iq))
        }
        "session-terminate" => {
            // Ending a stream is not leaving the conference: a participant who publishes nothing
            // still receives everyone else. Leaving the room's call is what tears them down.
            if let Some(participant) = conferences.get(&from) {
                let was_up = {
                    let mut streams = participant.streams.lock().expect("streams lock");
                    streams.pending.remove(&sid);
                    streams.up.remove(&sid)
                };
                if was_up {
                    participant.galene.close(&sid).await?;
                } else {
                    let stream = stream_id_of(&sid).to_string();
                    let mut streams = participant.streams.lock().expect("streams lock");
                    streams.down.remove(&stream);
                    streams.pending.remove(&stream);
                }
            }
            Ok(ok(iq))
        }
        _ => Ok(ok(iq)),
    }
}

impl Conferences {
    fn get(&self, jid: &str) -> Option<Arc<Participant>> {
        self.registry
            .lock()
            .expect("registry lock")
            .participants
            .get(jid)
            .cloned()
    }

    fn remove(&self, jid: &str) -> Option<Arc<Participant>> {
        let mut registry = self.registry.lock().expect("registry lock");
        registry.early.remove(jid);
        registry.participants.remove(jid)
    }

    fn matching(&self, room: &str, full: &str) -> Vec<Arc<Participant>> {
        self.registry
            .lock()
            .expect("registry lock")
            .participants
            .values()
            .filter(|p| p.room == room && p.jid == full)
            .cloned()
            .collect()
    }

    /// The participant to send this candidate to, or `None` once it is held for the
    /// `session-initiate` that is still opening their Galene connection.
    fn route(
        &self,
        jid: &str,
        stream: &str,
        candidate: Value,
    ) -> Option<(Arc<Participant>, Value)> {
        let mut registry = self.registry.lock().expect("registry lock");
        if let Some(participant) = registry.participants.get(jid) {
            return Some((participant.clone(), candidate));
        }
        let early = registry.early.entry(jid.to_string()).or_default();
        if early.len() < MAX_PENDING_CANDIDATES {
            early.push((stream.to_string(), candidate));
        }
        None
    }

    /// Register a participant, moving anything that arrived before it existed into its own
    /// per-stream hold.
    fn insert(&self, participant: &Arc<Participant>) {
        let mut registry = self.registry.lock().expect("registry lock");
        registry
            .participants
            .insert(participant.jid.clone(), participant.clone());
        let early = registry.early.remove(&participant.jid).unwrap_or_default();
        drop(registry);
        for (stream, candidate) in early {
            participant.route_candidate(&stream, candidate);
        }
    }
}

async fn ensure_participant(
    session: &Arc<Session>,
    conferences: &Conferences,
    jid: &str,
    conference: &str,
    room: &str,
) -> Result<Arc<Participant>> {
    if let Some(existing) = conferences.get(jid) {
        return Ok(existing);
    }
    let node = conference.split('@').next().unwrap_or(conference);
    let group = format!("vc/{node}");
    let (events_tx, events_rx) = mpsc::channel(64);
    let bare = Jid::new(jid)?.to_bare().to_string();
    let galene = GaleneClient::connect(
        &session.instance.galene_url,
        &group,
        &bare,
        GALENE_PASSWORD,
        events_tx,
    )
    .await?;
    let participant = Arc::new(Participant {
        jid: jid.to_string(),
        conference: conference.to_string(),
        room: room.to_string(),
        galene,
        streams: Mutex::new(Streams::default()),
    });
    conferences.insert(&participant);
    tokio::spawn(pump_events(session.clone(), participant.clone(), events_rx));
    info!(participant = jid, group, "joined galene");
    Ok(participant)
}

/// The room says this person entered the call. Open their conference connection now, so that
/// they receive everyone else whether or not they ever publish anything themselves: a denied
/// microphone should cost them their voice, not the whole call.
pub async fn on_joined_call(session: &Arc<Session>, room: &str, full: &str) {
    let Some(conference) = session.instance.store.conference_of(room).await else {
        return;
    };
    let conferences = &session.instance.conferences;
    if let Err(err) = ensure_participant(session, conferences, full, &conference, room).await {
        warn!(
            participant = full,
            room,
            ?err,
            "could not join the conference"
        );
    }
}

/// Galene events for one participant become Jingle towards that participant.
async fn pump_events(
    session: Arc<Session>,
    participant: Arc<Participant>,
    mut events: mpsc::Receiver<GaleneEvent>,
) {
    while let Some(event) = events.recv().await {
        let result = match event {
            GaleneEvent::Joined { ok: true, .. } => participant.galene.request_all().await,
            GaleneEvent::Joined { ok: false, error } => {
                warn!(participant = %participant.jid, ?error, "galene refused the join");
                break;
            }
            GaleneEvent::Answer { id, sdp } => {
                send_session(
                    &session,
                    &participant,
                    "session-accept",
                    &id,
                    &sdp,
                    Role::Responder,
                    None,
                )
                .await
            }
            GaleneEvent::Offer { id, username, sdp } => {
                let sid = down_session_id(&id, &username);
                participant
                    .streams
                    .lock()
                    .expect("streams lock")
                    .down
                    .insert(id, sid.clone());
                send_session(
                    &session,
                    &participant,
                    "session-initiate",
                    &sid,
                    &sdp,
                    Role::Initiator,
                    Some(&username),
                )
                .await
            }
            GaleneEvent::Ice { id, candidate } => {
                let sid = participant.down_sid(&id).unwrap_or(id);
                send_candidate(&session, &participant, &sid, &candidate).await
            }
            GaleneEvent::Close { id } | GaleneEvent::Abort { id } => {
                let sid = participant
                    .streams
                    .lock()
                    .expect("streams lock")
                    .down
                    .remove(&id)
                    .unwrap_or(id);
                send_terminate(&session, &participant, &sid).await
            }
            GaleneEvent::Disconnected => {
                warn!(participant = %participant.jid, "galene connection ended");
                break;
            }
        };
        if let Err(err) = result {
            warn!(participant = %participant.jid, ?err, "conference event failed");
        }
    }
    terminate_all(&session, &participant).await;
    session.instance.conferences.remove(&participant.jid);
}

async fn terminate_all(session: &Session, participant: &Participant) {
    let sids: Vec<String> = {
        let streams = participant.streams.lock().expect("streams lock");
        streams
            .down
            .values()
            .chain(streams.up.iter())
            .cloned()
            .collect()
    };
    for sid in sids {
        let _ = send_terminate(session, participant, &sid).await;
    }
}

fn jingle_iq(session: &Session, participant: &Participant, jingle: Element) -> Result<Iq> {
    Ok(Iq::Set {
        from: Some(Jid::new(&participant.conference)?),
        to: Some(Jid::new(&participant.jid)?),
        id: session.next_id(),
        payload: jingle,
    })
}

async fn send_session(
    session: &Session,
    participant: &Participant,
    action: &str,
    sid: &str,
    sdp: &str,
    writer: Role,
    stream_owner: Option<&str>,
) -> Result<()> {
    let body = sdp_jingle::sdp_to_jingle(sdp, writer)?;
    let mut jingle = Element::builder("jingle", NS_JINGLE)
        .attr_str("action", action)
        .attr_str("sid", sid);
    jingle = match action {
        "session-initiate" => jingle.attr_str("initiator", participant.conference.as_str()),
        _ => jingle.attr_str("responder", participant.conference.as_str()),
    };
    if let Some(group) = body.group {
        jingle = jingle.append(group);
    }
    for content in body.contents {
        jingle = jingle.append(content);
    }
    if let Some(owner) = stream_owner {
        let user =
            Element::builder("user", NS_COIN).attr_str("entity", format!("xmpp:{owner}").as_str());
        let users = Element::builder("users", NS_COIN).append(user);
        jingle = jingle.append(Element::builder("conference-info", NS_COIN).append(users));
    }
    session
        .request(jingle_iq(session, participant, jingle.build())?)
        .await?;
    Ok(())
}

async fn send_candidate(
    session: &Session,
    participant: &Participant,
    sid: &str,
    candidate: &Value,
) -> Result<()> {
    let Some(content) = sdp_jingle::ice_to_jingle_content(candidate) else {
        return Ok(());
    };
    let jingle = Element::builder("jingle", NS_JINGLE)
        .attr_str("action", "transport-info")
        .attr_str("sid", sid)
        .append(content)
        .build();
    session
        .request(jingle_iq(session, participant, jingle)?)
        .await?;
    Ok(())
}

async fn send_terminate(session: &Session, participant: &Participant, sid: &str) -> Result<()> {
    let reason = Element::builder("reason", NS_JINGLE).append(Element::builder("gone", NS_JINGLE));
    let jingle = Element::builder("jingle", NS_JINGLE)
        .attr_str("action", "session-terminate")
        .attr_str("sid", sid)
        .append(reason)
        .build();
    session
        .request(jingle_iq(session, participant, jingle)?)
        .await?;
    Ok(())
}

/// The room said this person is no longer in the call: tear down their media.
pub async fn on_left_call(session: &Arc<Session>, room: &str, full: &str) {
    for participant in session.instance.conferences.matching(room, full) {
        let _ = participant.galene.leave(&participant.group()).await;
        session.instance.conferences.remove(&participant.jid);
        terminate_all(session, &participant).await;
        info!(participant = %participant.jid, room, "removed from the conference");
    }
}
