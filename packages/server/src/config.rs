use anyhow::Result;
use clap::Parser;

#[derive(Parser, Debug, Clone)]
#[command(author, version, about, long_about = None)]
pub struct Config {
    /// Database URL
    #[arg(env = "DATABASE_URL", default_value = "postgres://postgres:password@localhost/voice_channel")]
    pub database_url: String,

    /// Server host
    #[arg(env = "HOST", default_value = "0.0.0.0")]
    pub host: String,

    /// Server port
    #[arg(env = "PORT", default_value = "3001")]
    pub port: u16,

    /// Instance FQDN for federation
    #[arg(env = "INSTANCE_FQDN", default_value = "localhost")]
    pub instance_fqdn: String,

    /// Enable federation
    #[arg(env = "ENABLE_FEDERATION", default_value = "false")]
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