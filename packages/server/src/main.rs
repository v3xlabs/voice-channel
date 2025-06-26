use anyhow::Result;
use poem::{
    listener::TcpListener,
    middleware::Cors,
    EndpointExt, Route, Server,
};
use poem_openapi::OpenApiService;
use std::sync::Arc;
use tracing::{info, Level};

mod config;
mod database;
mod error;
mod handlers;
mod models;

use config::Config;
use database::Database;
use handlers::api::Api;

#[derive(Clone)]
pub struct AppState {
    pub db: Database,
    pub config: Config,
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_max_level(Level::INFO)
        .init();

    // Load configuration
    let config = Config::from_env()?;
    info!("Starting voice-channel-server on {}", config.server_addr());

    // Initialize database
    let db = Database::new(&config.database_url).await?;
    db.run_migrations().await?;

    // Create shared application state
    let state = Arc::new(AppState { db, config });

    // Create API service
    let api_service = OpenApiService::new(Api { state }, "Voice Channel API", "1.0")
        .server("http://localhost:3001/api");
    
    // Build the app with OpenAPI docs
    let spec = api_service.spec_endpoint();
    
    // Configure CORS
    let cors = Cors::new()
        .allow_origin("http://localhost:3000")
        .allow_methods(vec!["GET", "POST", "PUT", "DELETE", "OPTIONS"])
        .allow_headers(vec!["content-type", "authorization"]);
    
    let app = Route::new()
        .nest("/api", api_service)
        .nest("/api-docs", spec)
        .with(cors);

    // Start server
    info!("Server running on http://0.0.0.0:3001");
    Server::new(TcpListener::bind("0.0.0.0:3001"))
        .run(app)
        .await?;

    Ok(())
} 