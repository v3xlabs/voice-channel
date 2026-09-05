use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use anyhow::{Result, anyhow, bail};
use futures::{SinkExt, StreamExt};
use tokio::sync::{mpsc, oneshot};
use tokio_xmpp::Component;
use tokio_xmpp::connect::TcpServerConnector;
use tokio_xmpp::jid::Jid;
use tokio_xmpp::parsers::disco::DiscoInfoQuery;
use tokio_xmpp::parsers::iq::Iq;
use tokio_xmpp::parsers::presence::Presence;
use tokio_xmpp::parsers::stanza::Stanza;
use tokio_xmpp::parsers::stanza_error::{DefinedCondition, ErrorType, StanzaError};
use tracing::{debug, error, warn};

use crate::Instance;

/// One component connection: outgoing stanzas go through a channel, incoming IQ
/// results are matched to the request that is waiting for them, and everything
/// else is dispatched to the handlers.
pub struct Session {
    outgoing: mpsc::Sender<Stanza>,
    pending: Mutex<HashMap<String, oneshot::Sender<Iq>>>,
    incoming: Mutex<Option<mpsc::Receiver<Stanza>>>,
    pub instance: Arc<Instance>,
    counter: Mutex<u64>,
}

impl Session {
    pub fn run(component: Component<TcpServerConnector>, instance: Arc<Instance>) -> Arc<Session> {
        let (outgoing, mut outgoing_rx) = mpsc::channel::<Stanza>(256);
        let (incoming_tx, incoming) = mpsc::channel::<Stanza>(256);
        let session = Arc::new(Session {
            outgoing,
            pending: Mutex::new(HashMap::new()),
            incoming: Mutex::new(Some(incoming)),
            instance,
            counter: Mutex::new(0),
        });

        let (mut sink, mut stream) = component.split();
        tokio::spawn(async move {
            while let Some(stanza) = outgoing_rx.recv().await {
                if let Err(err) = sink.send(stanza).await {
                    error!(?err, "send failed");
                    break;
                }
            }
        });
        let pump = session.clone();
        tokio::spawn(async move {
            while let Some(stanza) = stream.next().await {
                if let Stanza::Iq(iq) = &stanza
                    && matches!(iq, Iq::Result { .. } | Iq::Error { .. })
                {
                    let waiter = pump.pending.lock().expect("pending lock").remove(iq.id());
                    match waiter {
                        Some(waiter) => {
                            let _ = waiter.send(iq.clone());
                        }
                        None => debug!(id = iq.id(), "unmatched iq response"),
                    }
                    continue;
                }
                if incoming_tx.send(stanza).await.is_err() {
                    break;
                }
            }
            warn!("component stream ended");
            std::process::exit(1);
        });
        // The stream ends after `Timeouts::read_timeout` of silence, so keep it talking.
        let keepalive = session.clone();
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(std::time::Duration::from_secs(60));
            ticker.tick().await;
            loop {
                ticker.tick().await;
                let ping = Iq::from_get(keepalive.next_id(), DiscoInfoQuery { node: None })
                    .with_from(Jid::new(&keepalive.instance.actor()).expect("actor jid"))
                    .with_to(Jid::new(&keepalive.instance.domain).expect("domain jid"));
                if let Err(err) = keepalive.request(ping).await {
                    warn!(?err, "keepalive failed");
                }
            }
        });
        session
    }

    pub async fn serve(self: Arc<Self>) -> Result<()> {
        let mut incoming = self
            .incoming
            .lock()
            .expect("incoming lock")
            .take()
            .ok_or_else(|| anyhow!("serve called twice"))?;
        while let Some(stanza) = incoming.recv().await {
            let session = self.clone();
            tokio::spawn(async move {
                match stanza {
                    Stanza::Iq(iq) => session.handle_iq(iq).await,
                    Stanza::Presence(presence) => session.handle_presence(presence).await,
                    Stanza::Message(_) => {}
                }
            });
        }
        bail!("incoming channel closed")
    }

    pub fn next_id(&self) -> String {
        let mut counter = self.counter.lock().expect("counter lock");
        *counter += 1;
        format!("vcd-{}", *counter)
    }

    pub async fn send(&self, stanza: Stanza) {
        if self.outgoing.send(stanza).await.is_err() {
            error!("outgoing channel closed");
        }
    }

    /// Send an IQ and wait for its result. An error IQ becomes an `Err`.
    pub async fn request(&self, iq: Iq) -> Result<Iq> {
        let id = iq.id().to_string();
        let (tx, rx) = oneshot::channel();
        self.pending
            .lock()
            .expect("pending lock")
            .insert(id.clone(), tx);
        self.send(Stanza::Iq(iq)).await;
        let response = tokio::time::timeout(std::time::Duration::from_secs(15), rx).await;
        match response {
            Ok(Ok(Iq::Error { error, .. })) => Err(IqError(error).into()),
            Ok(Ok(iq)) => Ok(iq),
            Ok(Err(_)) => bail!("response channel dropped for {id}"),
            Err(_) => {
                self.pending.lock().expect("pending lock").remove(&id);
                bail!("timed out waiting for {id}")
            }
        }
    }

    async fn handle_iq(self: Arc<Self>, iq: Iq) {
        let from = iq.from().cloned();
        let id = iq.id().to_string();
        let result = match &iq {
            Iq::Get { payload, .. } => crate::disco::handle_get(&self, &iq, payload).await,
            Iq::Set { payload, .. } if payload.is("jingle", crate::sdp_jingle::NS_JINGLE) => {
                crate::conference::handle_jingle(&self, &iq, payload).await
            }
            Iq::Set { payload, .. } => crate::commands::handle_set(&self, &iq, payload).await,
            _ => Ok(None),
        };
        let reply = match result {
            Ok(Some(reply)) => reply,
            Ok(None) => return,
            Err(err) => {
                let error = match err.downcast_ref::<IqError>() {
                    Some(IqError(inner)) => inner.clone(),
                    None => {
                        warn!(id, ?err, "request failed");
                        StanzaError::new(
                            ErrorType::Cancel,
                            DefinedCondition::InternalServerError,
                            "en",
                            err.to_string(),
                        )
                    }
                };
                Iq::from_error(id, error)
            }
        };
        let reply = match (from, iq.to().cloned()) {
            (Some(from), Some(to)) => reply.with_to(from).with_from(to),
            (Some(from), None) => reply.with_to(from),
            _ => reply,
        };
        self.send(Stanza::Iq(reply)).await;
    }

    async fn handle_presence(self: Arc<Self>, presence: Presence) {
        crate::rooms::handle_presence(&self, presence).await;
    }
}

/// An error IQ received in response to one of our requests, or one we want to send back.
#[derive(Debug)]
pub struct IqError(pub StanzaError);

impl std::fmt::Display for IqError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}", self.0.defined_condition)
    }
}

impl std::error::Error for IqError {}

pub fn stanza_error(
    type_: ErrorType,
    condition: DefinedCondition,
    text: impl Into<String>,
) -> anyhow::Error {
    IqError(StanzaError::new(type_, condition, "en", text)).into()
}

pub fn condition_of(err: &anyhow::Error) -> Option<&DefinedCondition> {
    err.downcast_ref::<IqError>()
        .map(|IqError(inner)| &inner.defined_condition)
}
