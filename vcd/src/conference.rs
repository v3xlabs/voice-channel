//! The conference service: Jingle Audio/Video Conferences (ProtoXEP) on one side, Galene on
//! the other. Each stream a participant publishes is one Jingle session from them to us;
//! every stream we deliver is one Jingle session from us to them, as the ProtoXEP describes.

use std::collections::HashMap;
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
    /// Candidates from a client that trickled before its `session-initiate` finished opening
    /// the participant's Galene connection, by full JID and Galene stream id.
    early: HashMap<String, Vec<(String, Value)>>,
}

/// A client trickles a handful of candidates per stream. Anything past this is not a client
/// waiting on its own `session-initiate`.
const MAX_EARLY_CANDIDATES: usize = 32;

struct Participant {
    jid: String,
    conference: String,
    room: String,
    galene: GaleneClient,
    /// Sessions in which this participant sends media to us, by session id.
    ups: Mutex<HashMap<String, ()>>,
    /// Sessions in which we send other participants' streams to them: Galene stream id to session id.
    downs: Mutex<HashMap<String, String>>,
}

impl Participant {
    fn group(&self) -> String {
        format!("vc/{}", self.conference.split('@').next().unwrap_or(""))
    }

    fn down_sid(&self, stream_id: &str) -> Option<String> {
        self.downs
            .lock()
            .expect("downs lock")
            .get(stream_id)
            .cloned()
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
            let (participant, early) =
                ensure_participant(session, conferences, &from, &conference, &room).await?;
            let sdp = sdp_jingle::jingle_to_sdp(jingle, Role::Initiator)?;
            let label = if sid.starts_with(SCREEN_SID_PREFIX) {
                "screenshare"
            } else {
                "camera"
            };
            participant
                .ups
                .lock()
                .expect("ups lock")
                .insert(sid.clone(), ());
            participant.galene.offer(&sid, label, &sdp).await?;
            // Galene drops a candidate for a stream it has not been offered yet, so these only
            // go out now that the offer is through.
            for (stream, candidate) in early {
                participant.galene.ice(&stream, candidate).await?;
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
                // session-initiate, well before that initiate has opened its Galene connection.
                if let Some((participant, candidate)) = conferences.route(&from, stream, candidate)
                {
                    participant.galene.ice(stream, candidate).await?;
                }
            }
            Ok(ok(iq))
        }
        "session-terminate" => {
            if let Some(participant) = conferences.get(&from) {
                let was_up = participant
                    .ups
                    .lock()
                    .expect("ups lock")
                    .remove(&sid)
                    .is_some();
                if was_up {
                    participant.galene.close(&sid).await?;
                } else {
                    let stream_id = stream_id_of(&sid).to_string();
                    participant
                        .downs
                        .lock()
                        .expect("downs lock")
                        .remove(&stream_id);
                }
                let idle = participant.ups.lock().expect("ups lock").is_empty();
                if idle {
                    let _ = participant.galene.leave(&participant.group()).await;
                    conferences.remove(&from);
                    info!(participant = %from, "left the conference");
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
        if early.len() < MAX_EARLY_CANDIDATES {
            early.push((stream.to_string(), candidate));
        }
        None
    }

    /// Register a participant and take the candidates that arrived while it was opening.
    fn insert(&self, participant: &Arc<Participant>) -> Vec<(String, Value)> {
        let mut registry = self.registry.lock().expect("registry lock");
        registry
            .participants
            .insert(participant.jid.clone(), participant.clone());
        registry.early.remove(&participant.jid).unwrap_or_default()
    }
}

async fn ensure_participant(
    session: &Arc<Session>,
    conferences: &Conferences,
    jid: &str,
    conference: &str,
    room: &str,
) -> Result<(Arc<Participant>, Vec<(String, Value)>)> {
    if let Some(existing) = conferences.get(jid) {
        return Ok((existing, Vec::new()));
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
        ups: Mutex::new(HashMap::new()),
        downs: Mutex::new(HashMap::new()),
    });
    let early = conferences.insert(&participant);
    tokio::spawn(pump_events(session.clone(), participant.clone(), events_rx));
    info!(participant = jid, group, "joined galene");
    Ok((participant, early))
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
                    .downs
                    .lock()
                    .expect("downs lock")
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
                    .downs
                    .lock()
                    .expect("downs lock")
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
    let downs: Vec<String> = participant
        .downs
        .lock()
        .expect("downs lock")
        .values()
        .cloned()
        .collect();
    let ups: Vec<String> = participant
        .ups
        .lock()
        .expect("ups lock")
        .keys()
        .cloned()
        .collect();
    for sid in downs.into_iter().chain(ups) {
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
