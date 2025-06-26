use poem_openapi::{payload::Json, OpenApi, ApiResponse, Object};
use std::sync::Arc;

use crate::{
    error::AppError,
    models::channel::{Channel, CreateChannelRequest},
    AppState,
};

#[derive(ApiResponse)]
enum ChannelResponse {
    #[oai(status = 200)]
    Ok(Json<Vec<Channel>>),
    #[oai(status = 500)]
    InternalServerError,
}

#[derive(ApiResponse)]
enum CreateChannelResponse {
    #[oai(status = 201)]
    Created(Json<Channel>),
    #[oai(status = 400)]
    BadRequest,
    #[oai(status = 500)]
    InternalServerError,
}

#[derive(Object)]
struct HealthResponse {
    pub status: String,
    pub version: String,
    pub instance_fqdn: String,
}

#[derive(ApiResponse)]
enum HealthCheckResponse {
    #[oai(status = 200)]
    Ok(Json<HealthResponse>),
}

pub struct Api {
    pub state: Arc<AppState>,
}

#[OpenApi]
impl Api {
    /// Health check endpoint
    #[oai(path = "/health", method = "get", tag = "ApiTags::Health")]
    async fn health_check(&self) -> HealthCheckResponse {
        HealthCheckResponse::Ok(Json(HealthResponse {
            status: "healthy".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            instance_fqdn: self.state.config.instance_fqdn.clone(),
        }))
    }

    /// List all channels
    #[oai(path = "/channels", method = "get", tag = "ApiTags::Channels")]
    async fn list_channels(&self) -> ChannelResponse {
        match Channel::list_all(&self.state.db).await {
            Ok(channels) => ChannelResponse::Ok(Json(channels)),
            Err(_) => ChannelResponse::InternalServerError,
        }
    }

    /// Create a new channel
    #[oai(path = "/channels", method = "post", tag = "ApiTags::Channels")]
    async fn create_channel(&self, request: Json<CreateChannelRequest>) -> CreateChannelResponse {
        // Check if channel with this name already exists
        match Channel::find_by_name(&self.state.db, &request.name).await {
            Ok(Some(_)) => CreateChannelResponse::BadRequest,
            Ok(None) => {
                match Channel::create(&self.state.db, request.0, self.state.config.instance_fqdn.clone()).await {
                    Ok(channel) => CreateChannelResponse::Created(Json(channel)),
                    Err(_) => CreateChannelResponse::InternalServerError,
                }
            }
            Err(_) => CreateChannelResponse::InternalServerError,
        }
    }
}

use poem_openapi::Tags;

#[derive(Tags)]
enum ApiTags {
    /// Health check endpoints
    Health,
    /// Voice channel management
    Channels,
} 