use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

/// A guild as the daemon owns it. Rooms and the PubSub manifest are projections of this.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Guild {
    pub slug: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub icon_url: Option<String>,
    #[serde(default)]
    pub public: bool,
    #[serde(default)]
    pub categories: Vec<Category>,
    /// Bare JID to affiliation. Every room in the guild carries the same affiliations.
    #[serde(default)]
    pub members: BTreeMap<String, Affiliation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub name: String,
    #[serde(default)]
    pub channels: Vec<Channel>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Channel {
    pub kind: ChannelKind,
    pub name: String,
    pub jid: String,
    #[serde(default)]
    pub conference: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChannelKind {
    Text,
    Voice,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Affiliation {
    Owner,
    Admin,
    Member,
}

impl Affiliation {
    pub fn parse(value: &str) -> Option<Affiliation> {
        match value {
            "owner" => Some(Affiliation::Owner),
            "admin" => Some(Affiliation::Admin),
            "member" => Some(Affiliation::Member),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Affiliation::Owner => "owner",
            Affiliation::Admin => "admin",
            Affiliation::Member => "member",
        }
    }

    pub fn can_administer(self) -> bool {
        matches!(self, Affiliation::Owner | Affiliation::Admin)
    }
}

impl Guild {
    pub fn channels(&self) -> impl Iterator<Item = &Channel> {
        self.categories
            .iter()
            .flat_map(|category| category.channels.iter())
    }

    pub fn affiliation_of(&self, jid: &str) -> Option<Affiliation> {
        self.members.get(jid).copied()
    }
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct Persisted {
    #[serde(default)]
    guilds: BTreeMap<String, Guild>,
}

pub struct Store {
    path: PathBuf,
    data: Mutex<Persisted>,
}

impl Store {
    pub async fn open(dir: &Path) -> Result<Store> {
        tokio::fs::create_dir_all(dir).await?;
        let path = dir.join("guilds.json");
        let data = match tokio::fs::read(&path).await {
            Ok(bytes) => serde_json::from_slice(&bytes)
                .with_context(|| format!("parsing {}", path.display()))?,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => Persisted::default(),
            Err(err) => return Err(err).with_context(|| format!("reading {}", path.display())),
        };
        Ok(Store {
            path,
            data: Mutex::new(data),
        })
    }

    pub async fn get(&self, slug: &str) -> Option<Guild> {
        self.data.lock().await.guilds.get(slug).cloned()
    }

    pub async fn all(&self) -> Vec<Guild> {
        self.data.lock().await.guilds.values().cloned().collect()
    }

    pub async fn put(&self, guild: Guild) -> Result<()> {
        let mut data = self.data.lock().await;
        data.guilds.insert(guild.slug.clone(), guild);
        self.write(&data).await
    }

    pub async fn remove(&self, slug: &str) -> Result<()> {
        let mut data = self.data.lock().await;
        data.guilds.remove(slug);
        self.write(&data).await
    }

    async fn write(&self, data: &Persisted) -> Result<()> {
        let bytes = serde_json::to_vec_pretty(data)?;
        let tmp = self.path.with_extension("json.tmp");
        tokio::fs::write(&tmp, bytes).await?;
        tokio::fs::rename(&tmp, &self.path).await?;
        Ok(())
    }
}
