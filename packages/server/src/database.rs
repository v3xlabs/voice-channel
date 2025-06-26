use anyhow::Result;
use sqlx::{migrate::MigrateDatabase, PgPool, Postgres};
use tracing::info;

#[derive(Clone)]
pub struct Database {
    pub pool: PgPool,
}

impl Database {
    pub async fn new(database_url: &str) -> Result<Self> {
        // Create database if it doesn't exist
        if !Postgres::database_exists(database_url).await.unwrap_or(false) {
            info!("Creating database...");
            Postgres::create_database(database_url).await?;
        }

        // Connect to database
        let pool = PgPool::connect(database_url).await?;

        Ok(Self { pool })
    }

    pub async fn run_migrations(&self) -> Result<()> {
        info!("Running database migrations...");
        sqlx::migrate!("./migrations").run(&self.pool).await?;
        info!("Migrations completed successfully");
        Ok(())
    }
} 