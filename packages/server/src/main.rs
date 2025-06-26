use anyhow::Result;
use poem::{
    listener::TcpListener,
    middleware::Cors,
    EndpointExt, Route, Server,
};
use poem_openapi::{OpenApi, OpenApiService};
use std::sync::Arc;
use tracing::{info, Level};

mod config;
mod database;
mod error;
mod handlers;
mod models;

use config::Config;
use database::Database;
use error::AppError;

#[derive(OpenApi)]
#[openapi(
    paths(
        handlers::health::health_check,
        handlers::channels::list_channels,
        handlers::channels::create_channel,
    ),
    components(
        schemas(
            models::channel::Channel,
            models::channel::CreateChannelRequest,
            handlers::health::HealthResponse,
        )
    ),
    tags(
        (name = "health", description = "Health check endpoints"),
        (name = "channels", description = "Voice channel management"),
    )
)]
struct ApiDoc;

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

    // Build router
    let app = create_router(state);

    // Start server
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3001").await?;
    info!("Server running on http://0.0.0.0:3001");
    axum::serve(listener, app).await?;

    Ok(())
}

fn create_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/health", get(handlers::health::health_check))
        .route("/api/channels", get(handlers::channels::list_channels))
        .route("/api/channels", post(handlers::channels::create_channel))
        .merge(SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", ApiDoc::openapi()))
        .layer(CorsLayer::permissive())
        .with_state(state)
} 