use poem_openapi::{payload::Json, OpenApi, ApiResponse};
use uuid::Uuid;

use crate::error::AppError;
use crate::models::webrtc::*;
use crate::models::participant::*;
use crate::{MediasoupService, ParticipantService};

pub struct WebRtcApi {
    mediasoup_service: std::sync::Arc<MediasoupService>,
    participant_service: std::sync::Arc<ParticipantService>,
}

impl WebRtcApi {
    pub fn new(
        mediasoup_service: std::sync::Arc<MediasoupService>,
        participant_service: std::sync::Arc<ParticipantService>,
    ) -> Self {
        Self {
            mediasoup_service,
            participant_service,
        }
    }
}

#[derive(ApiResponse)]
enum WebRtcResponse<T: poem_openapi::types::ToJSON + poem_openapi::types::Type + Send> {
    #[oai(status = 200)]
    Ok(Json<T>),
    #[oai(status = 500)]
    InternalServerError,
}

#[derive(ApiResponse)]
enum JoinResponse {
    #[oai(status = 200)]
    Ok(Json<ParticipantJoinResponse>),
    #[oai(status = 400)]
    BadRequest,
    #[oai(status = 500)]
    InternalServerError,
}

#[OpenApi]
impl WebRtcApi {
    /// Join a voice channel
    #[oai(path = "/api/channels/:id/join", method = "post")]
    async fn join_channel(
        &self,
        id: poem::web::Path<Uuid>,
        request: Json<ParticipantJoinRequest>,
    ) -> Result<JoinResponse, AppError> {
        let channel_id = id.0;
        
        // Ensure room exists
        let _room = self.mediasoup_service.get_or_create_room(channel_id).await
            .map_err(|e| AppError::InternalServerError(e.to_string()))?;

        // Join participant
        let participant = self.participant_service.join_channel(
            channel_id,
            request.user_id.clone(),
            request.display_name.clone(),
        ).await
            .map_err(|e| AppError::InternalServerError(e.to_string()))?;

        let response = ParticipantJoinResponse {
            participant_id: participant.id,
            user_id: participant.user_id,
            display_name: participant.display_name,
            audio_enabled: participant.audio_enabled,
            video_enabled: participant.video_enabled,
        };

        Ok(JoinResponse::Ok(Json(response)))
    }

    /// Leave a voice channel
    #[oai(path = "/api/channels/:id/leave", method = "post")]
    async fn leave_channel(
        &self,
        id: poem::web::Path<Uuid>,
        request: Json<ParticipantLeaveRequest>,
    ) -> Result<WebRtcResponse<ParticipantLeaveResponse>, AppError> {
        let channel_id = id.0;
        
        self.participant_service.leave_channel(channel_id, &request.participant_id).await
            .map_err(|e| AppError::InternalServerError(e.to_string()))?;

        let response = ParticipantLeaveResponse {
            success: true,
        };

        Ok(WebRtcResponse::Ok(Json(response)))
    }

    /// Get router RTP capabilities for a channel
    #[oai(path = "/api/channels/:id/rtp-capabilities", method = "get")]
    async fn get_router_rtp_capabilities(
        &self,
        id: poem::web::Path<Uuid>,
    ) -> Result<WebRtcResponse<RtpCapabilities>, AppError> {
        let channel_id = id.0;
        
        // Ensure room exists
        let _room = self.mediasoup_service.get_or_create_room(channel_id).await
            .map_err(|e| AppError::InternalServerError(e.to_string()))?;

        let capabilities = self.mediasoup_service.get_router_rtp_capabilities(channel_id)
            .map_err(|e| AppError::InternalServerError(e.to_string()))?;

        Ok(WebRtcResponse::Ok(Json(capabilities)))
    }

    /// Create WebRTC transport for a channel
    #[oai(path = "/api/channels/:id/transports", method = "post")]
    async fn create_transport(
        &self,
        id: poem::web::Path<Uuid>,
        request: Json<CreateTransportRequest>,
    ) -> Result<WebRtcResponse<TransportInfo>, AppError> {
        let channel_id = id.0;

        let transport_info = self.mediasoup_service.create_webrtc_transport(
            channel_id,
            request.producing,
            request.consuming,
        ).await
            .map_err(|e| AppError::InternalServerError(e.to_string()))?;

        Ok(WebRtcResponse::Ok(Json(transport_info)))
    }

    /// Connect a WebRTC transport
    #[oai(path = "/api/transports/:id/connect", method = "post")]
    async fn connect_transport(
        &self,
        id: poem::web::Path<String>,
        request: Json<ConnectTransportRequest>,
    ) -> Result<WebRtcResponse<ConnectTransportResponse>, AppError> {
        let transport_id = &id.0;

        self.mediasoup_service.connect_transport(
            transport_id,
            &request.dtls_parameters,
        ).await
            .map_err(|e| AppError::InternalServerError(e.to_string()))?;

        let response = ConnectTransportResponse {
            success: true,
        };

        Ok(WebRtcResponse::Ok(Json(response)))
    }

    /// Start producing media on a transport
    #[oai(path = "/api/transports/:id/produce", method = "post")]
    async fn produce(
        &self,
        id: poem::web::Path<String>,
        request: Json<ProduceRequest>,
    ) -> Result<WebRtcResponse<ProduceResponse>, AppError> {
        let transport_id = &id.0;

        let producer_id = self.mediasoup_service.produce(
            transport_id,
            &request.kind,
            request.rtp_parameters.clone(),
        ).await
            .map_err(|e| AppError::InternalServerError(e.to_string()))?;

        let response = ProduceResponse {
            producer_id,
        };

        Ok(WebRtcResponse::Ok(Json(response)))
    }

    /// Start consuming media from a producer
    #[oai(path = "/api/transports/:id/consume", method = "post")]
    async fn consume(
        &self,
        id: poem::web::Path<String>,
        request: Json<ConsumeRequest>,
    ) -> Result<WebRtcResponse<ConsumeResponse>, AppError> {
        let transport_id = &id.0;

        let (consumer_id, kind, rtp_parameters) = self.mediasoup_service.consume(
            transport_id,
            &request.producer_id,
            &request.rtp_capabilities,
        ).await
            .map_err(|e| AppError::InternalServerError(e.to_string()))?;

        let response = ConsumeResponse {
            consumer_id,
            producer_id: request.producer_id.clone(),
            kind,
            rtp_parameters,
        };

        Ok(WebRtcResponse::Ok(Json(response)))
    }

    /// Update participant state
    #[oai(path = "/api/participants/:id", method = "put")]
    async fn update_participant(
        &self,
        id: poem::web::Path<String>,
        request: Json<ParticipantUpdateRequest>,
    ) -> Result<WebRtcResponse<ParticipantUpdateResponse>, AppError> {
        let participant_id = &id.0;

        let participant = self.participant_service.update_participant(
            participant_id,
            request.audio_enabled,
            request.video_enabled,
        ).await
            .map_err(|e| AppError::InternalServerError(e.to_string()))?;

        let response = ParticipantUpdateResponse {
            participant_id: participant.id,
            audio_enabled: participant.audio_enabled,
            video_enabled: participant.video_enabled,
        };

        Ok(WebRtcResponse::Ok(Json(response)))
    }
}

use poem_openapi::Tags;

#[derive(Tags)]
enum ApiTags {
    /// WebRTC and media routing endpoints
    WebRTC,
} 