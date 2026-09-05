mod admin;
mod commands;
mod conference;
mod disco;
mod galene;
mod manifest;
mod pubsub;
mod rooms;
mod sdp_jingle;
mod session;
mod store;
mod xml;

use std::path::PathBuf;
use std::sync::Arc;

use anyhow::{Context, Result};
use clap::Parser;
use tokio_xmpp::Component;
use tokio_xmpp::connect::DnsConfig;
use tokio_xmpp::xmlstream::Timeouts;
use tracing::info;

use crate::session::Session;
use crate::store::Store;

#[derive(Parser, Debug)]
#[command(name = "vcd", about = "voice.channel daemon")]
struct Args {
    /// Component JID, for example vc.localhost
    #[arg(long, env = "VCD_JID")]
    jid: String,
    /// Shared secret from the Prosody component definition
    #[arg(long, env = "VCD_SECRET")]
    secret: String,
    /// Prosody component port
    #[arg(long, env = "VCD_SERVER", default_value = "127.0.0.1:5347")]
    server: String,
    /// The instance domain whose users and services this daemon serves
    #[arg(long, env = "VCD_DOMAIN")]
    domain: String,
    /// Directory for daemon state
    #[arg(long, env = "VCD_DATA")]
    data: PathBuf,
    /// Bare JIDs allowed to create guilds, invites, and accounts. Comma separated.
    #[arg(long, env = "VCD_ADMINS", value_delimiter = ',', default_value = "")]
    admins: Vec<String>,
    /// Galene websocket endpoint, reached only by this daemon
    #[arg(long, env = "VCD_GALENE", default_value = "ws://127.0.0.1:8443/ws")]
    galene: String,
}

/// Everything a request handler needs about the instance.
pub struct Instance {
    pub component: String,
    pub domain: String,
    pub rooms: String,
    pub pubsub: String,
    pub store: Store,
    pub galene_url: String,
    /// Instance administrators, as bare JIDs.
    pub admins: Vec<String>,
    pub voice: crate::rooms::VoiceRooms,
    pub conferences: crate::conference::Conferences,
}

impl Instance {
    /// The full JID the daemon acts from when it is an occupant or a publisher.
    pub fn actor(&self) -> String {
        format!("vcd@{}/vcd", self.component)
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("vcd=info")),
        )
        .init();
    let args = Args::parse();

    let store = Store::open(&args.data)
        .await
        .context("opening state directory")?;
    let instance = Arc::new(Instance {
        component: args.jid.clone(),
        rooms: format!("rooms.{}", args.domain),
        pubsub: format!("pubsub.{}", args.domain),
        domain: args.domain,
        store,
        galene_url: args.galene,
        admins: args
            .admins
            .into_iter()
            .map(|a| a.trim().to_string())
            .filter(|a| !a.is_empty())
            .collect(),
        voice: Default::default(),
        conferences: Default::default(),
    });

    let component = Component::new_plaintext(
        &args.jid,
        &args.secret,
        DnsConfig::addr(&args.server),
        Timeouts::default(),
    )
    .await
    .context("connecting to the component port")?;
    info!(jid = %args.jid, server = %args.server, "component connected");

    let session = Session::run(component, instance.clone());
    let voice_rooms = session.clone();
    tokio::spawn(async move {
        for guild in instance.store.all().await {
            for channel in guild
                .channels()
                .filter(|c| c.kind == crate::store::ChannelKind::Voice)
            {
                if let Err(err) = crate::rooms::stay(&voice_rooms, &channel.jid).await {
                    tracing::warn!(room = %channel.jid, ?err, "could not join voice room");
                }
            }
        }
    });
    session.serve().await
}
