use anyhow::Result;
use clap::Parser;

#[derive(Parser, Debug, Clone)]
#[command(author, version, about, long_about = None)]
pub struct Config {
    /// Database URL
    #[arg(long, env = "DATABASE_URL", default_value = "postgres://postgres:password@localhost/voice_channel")]
    pub database_url: String,

    /// Server host
    #[arg(long, env = "HOST", default_value = "0.0.0.0")]
    pub host: String,

    /// Server port
    #[arg(long, env = "PORT", default_value = "3001")]
    pub port: u16,

    /// Instance FQDN for federation
    #[arg(long, env = "INSTANCE_FQDN", default_value = "localhost")]
    pub instance_fqdn: String,

    /// Enable federation
    #[arg(long, env = "ENABLE_FEDERATION", action = clap::ArgAction::SetTrue)]
    pub enable_federation: bool,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        dotenvy::dotenv().ok(); // Load .env file if it exists
        Ok(Self::parse())
    }

    pub fn server_addr(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }
} 