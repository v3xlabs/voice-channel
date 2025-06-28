use anyhow::Result;
use poem::{
    listener::TcpListener,
    middleware::Cors,
    web::Html,
    EndpointExt, Route, Server,
};
// Rate limiting temporarily disabled for development
use poem_openapi::OpenApiService;
use std::sync::Arc;
use tracing::{info, Level};

mod config;
mod database;
mod error;
mod handlers;
mod models;
mod services;

use config::Config;
use database::Database;
use handlers::api::Api;
use services::mediasoup_service::MediasoupService;
use services::participant_service::ParticipantService;
use services::webauthn::WebAuthnService;

/// Determine WebAuthn origin and RP ID based on instance FQDN
fn determine_webauthn_config(instance_fqdn: &str) -> (String, String) {
    if instance_fqdn == "localhost" || instance_fqdn.starts_with("localhost:") {
        // Development environment - frontend runs on port 5173
        ("http://localhost:5173".to_string(), "localhost".to_string())
    } else if instance_fqdn.contains("localhost") {
        // Edge case: localhost with different format
        ("http://localhost:5173".to_string(), "localhost".to_string())
    } else {
        // Production environment - use HTTPS and the actual FQDN
        let origin = format!("https://{}", instance_fqdn);
        let rp_id = instance_fqdn.to_string();
        (origin, rp_id)
    }
}

#[derive(Clone)]
pub struct AppState {
    pub db: Database,
    pub config: Config,
    pub mediasoup: Arc<MediasoupService>,
    pub participants: Arc<ParticipantService>,
    pub webauthn: Arc<WebAuthnService>,
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

    // Initialize Mediasoup service
    info!("Initializing Mediasoup service...");
    let mediasoup = Arc::new(MediasoupService::new().await?);
    info!("Mediasoup service initialized successfully");

    // Initialize participant service
    let participants = Arc::new(ParticipantService::new());

    // Initialize WebAuthn service with environment-based configuration
    let (webauthn_origin, webauthn_rp_id) = determine_webauthn_config(&config.instance_fqdn);
    info!("WebAuthn configuration: origin={}, rp_id={}", webauthn_origin, webauthn_rp_id);
    
    let webauthn = Arc::new(WebAuthnService::new(
        &webauthn_origin,
        &webauthn_rp_id,
        config.instance_fqdn.clone(),
    )?);

    // Validate WebAuthn configuration
    webauthn.validate_config()?;
    info!("WebAuthn service configuration validated successfully");

    // Create shared application state
    let state = Arc::new(AppState { 
        db, 
        config,
        mediasoup,
        participants,
        webauthn,
    });

    // Create unified API service that includes both channel and WebRTC endpoints
    let api_service = OpenApiService::new(Api { state }, "Voice Channel API", "1.0")
        .server("http://localhost:3001/api");
    
    let spec_endpoint = api_service.spec_endpoint();
    
    // Configure CORS
    let cors = Cors::new()
        .allow_origin_regex("*")
        .allow_methods(vec!["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"])
        .allow_headers(vec!["content-type", "authorization"]);
    
    // Rate limiting will be implemented later
    
    // Scalar documentation HTML
    let docs_html = include_str!("docs.html");
    
    let app = Route::new()
        .nest("/api", api_service)
        .at("/openapi.json", spec_endpoint)
        .at("/docs", poem::endpoint::make_sync(move |_| {
            Html(docs_html)
        }))
        .with(cors);

    // Start server
    info!("Server running on http://0.0.0.0:3001");
    info!("API documentation available at http://0.0.0.0:3001/docs");
    info!("OpenAPI spec available at http://0.0.0.0:3001/openapi.json");
    Server::new(TcpListener::bind("0.0.0.0:3001"))
        .run(app)
        .await?;

    Ok(())
} 