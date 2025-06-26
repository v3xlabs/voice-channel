use axum::{extract::State, response::Json};
use std::sync::Arc;

use crate::{
    error::AppError,
    models::channel::{Channel, CreateChannelRequest},
    AppState,
};

/// List all channels
#[utoipa::path(
    get,
    path = "/api/channels",
    responses(
        (status = 200, description = "List of channels", body = Vec<Channel>)
    ),
    tag = "channels"
)]
pub async fn list_channels(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<Channel>>, AppError> {
    let channels = Channel::list_all(&state.db).await?;
    Ok(Json(channels))
}

/// Create a new channel
#[utoipa::path(
    post,
    path = "/api/channels",
    request_body = CreateChannelRequest,
    responses(
        (status = 201, description = "Channel created successfully", body = Channel),
        (status = 400, description = "Bad request")
    ),
    tag = "channels"
)]
pub async fn create_channel(
    State(state): State<Arc<AppState>>,
    Json(request): Json<CreateChannelRequest>,
) -> Result<Json<Channel>, AppError> {
    // Check if channel with this name already exists
    if let Some(_) = Channel::find_by_name(&state.db, &request.name).await? {
        return Err(AppError::BadRequest(format!(
            "Channel with name '{}' already exists",
            request.name
        )));
    }

    let channel = Channel::create(&state.db, request, state.config.instance_fqdn.clone()).await?;
    Ok(Json(channel))
} 