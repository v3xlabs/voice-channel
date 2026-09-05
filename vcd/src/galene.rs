//! Galene's client protocol: a symmetric JSON websocket. One connection per participant.
//! Reference: galene-protocol.md in the Galene repository.

use anyhow::{Context, Result, anyhow};
use futures::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio::sync::mpsc;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;
use tracing::{debug, warn};

#[derive(Debug)]
pub enum GaleneEvent {
    Joined {
        ok: bool,
        error: Option<String>,
    },
    /// Galene pushes a stream to us: it is the RTP sender and we answer.
    Offer {
        id: String,
        username: String,
        sdp: String,
    },
    /// Galene accepted a stream we publish.
    Answer {
        id: String,
        sdp: String,
    },
    Ice {
        id: String,
        candidate: Value,
    },
    Close {
        id: String,
    },
    Abort {
        id: String,
    },
    Disconnected,
}

pub struct GaleneClient {
    outgoing: mpsc::Sender<Value>,
}

impl GaleneClient {
    pub async fn connect(
        url: &str,
        group: &str,
        username: &str,
        password: &str,
        events: mpsc::Sender<GaleneEvent>,
    ) -> Result<GaleneClient> {
        let (stream, _) = connect_async(url)
            .await
            .with_context(|| format!("connecting to galene at {url}"))?;
        let (mut sink, mut source) = stream.split();
        let (outgoing, mut outgoing_rx) = mpsc::channel::<Value>(64);

        let client_id = format!("vcd-{}", rand_id());
        sink.send(Message::text(
            json!({ "type": "handshake", "version": ["2"], "id": client_id }).to_string(),
        ))
        .await?;
        sink.send(Message::text(
            json!({ "type": "join", "kind": "join", "group": group, "username": username, "password": password }).to_string(),
        ))
        .await?;

        tokio::spawn(async move {
            while let Some(message) = outgoing_rx.recv().await {
                if sink.send(Message::text(message.to_string())).await.is_err() {
                    break;
                }
            }
        });

        let pong = outgoing.clone();
        tokio::spawn(async move {
            while let Some(frame) = source.next().await {
                let text = match frame {
                    Ok(Message::Text(text)) => text,
                    Ok(Message::Close(_)) | Err(_) => break,
                    Ok(_) => continue,
                };
                let value: Value = match serde_json::from_str(&text) {
                    Ok(value) => value,
                    Err(err) => {
                        warn!(?err, "galene sent invalid json");
                        continue;
                    }
                };
                let event = match value["type"].as_str().unwrap_or("") {
                    "ping" => {
                        let _ = pong.send(json!({ "type": "pong" })).await;
                        continue;
                    }
                    "joined" => match value["kind"].as_str() {
                        Some("join") => GaleneEvent::Joined {
                            ok: true,
                            error: None,
                        },
                        Some("fail") => GaleneEvent::Joined {
                            ok: false,
                            error: Some(
                                value["value"].as_str().unwrap_or("join failed").to_string(),
                            ),
                        },
                        _ => continue,
                    },
                    "offer" => GaleneEvent::Offer {
                        id: string(&value, "id"),
                        username: string(&value, "username"),
                        sdp: string(&value, "sdp"),
                    },
                    "answer" => GaleneEvent::Answer {
                        id: string(&value, "id"),
                        sdp: string(&value, "sdp"),
                    },
                    "ice" => GaleneEvent::Ice {
                        id: string(&value, "id"),
                        candidate: value["candidate"].clone(),
                    },
                    "close" => GaleneEvent::Close {
                        id: string(&value, "id"),
                    },
                    "abort" => GaleneEvent::Abort {
                        id: string(&value, "id"),
                    },
                    other => {
                        debug!(kind = other, "galene message ignored");
                        continue;
                    }
                };
                if events.send(event).await.is_err() {
                    break;
                }
            }
            let _ = events.send(GaleneEvent::Disconnected).await;
        });

        Ok(GaleneClient { outgoing })
    }

    async fn send(&self, message: Value) -> Result<()> {
        self.outgoing
            .send(message)
            .await
            .map_err(|_| anyhow!("galene connection closed"))
    }

    /// Ask for every stream in the group. Galene sends an `offer` per stream.
    pub async fn request_all(&self) -> Result<()> {
        self.send(json!({ "type": "request", "request": { "": ["audio", "video"] } }))
            .await
    }

    pub async fn offer(&self, id: &str, label: &str, sdp: &str) -> Result<()> {
        self.send(json!({ "type": "offer", "id": id, "label": label, "sdp": sdp }))
            .await
    }

    pub async fn answer(&self, id: &str, sdp: &str) -> Result<()> {
        self.send(json!({ "type": "answer", "id": id, "sdp": sdp }))
            .await
    }

    pub async fn ice(&self, id: &str, candidate: Value) -> Result<()> {
        self.send(json!({ "type": "ice", "id": id, "candidate": candidate }))
            .await
    }

    pub async fn close(&self, id: &str) -> Result<()> {
        self.send(json!({ "type": "close", "id": id })).await
    }

    pub async fn leave(&self, group: &str) -> Result<()> {
        self.send(json!({ "type": "join", "kind": "leave", "group": group }))
            .await
    }
}

fn string(value: &Value, key: &str) -> String {
    value[key].as_str().unwrap_or("").to_string()
}

pub fn rand_id() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{nanos:x}")
}
