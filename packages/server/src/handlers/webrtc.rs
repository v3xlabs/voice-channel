use poem_openapi::{payload::Json, OpenApi, ApiResponse, Object};
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    models::{
        webrtc::{
            RtpCapabilities, TransportInfo, CreateTransportRequest, ConnectTransportRequest,
            ProduceRequest, ProduceResponse, ConsumeRequest, ConsumeResponse,
        },
        participant::{JoinChannelRequest, Participant, ParticipantUpdate},
        channel::Channel,
    },
    AppState,
};

#[derive(ApiResponse)]
enum WebRtcResponse<T: poem_openapi::types::ToJSON + poem_openapi::types::Type + Send> {
    #[oai(status = 200)]
    Ok(Json<T>),
    #[oai(status = 400)]
    BadRequest,
    #[oai(status = 404)]
    NotFound,
    #[oai(status = 500)]
    InternalServerError,
}

#[derive(ApiResponse)]
enum JoinResponse {
    #[oai(status = 200)]
    Ok(Json<Participant>),
    #[oai(status = 400)]
    BadRequest,
    #[oai(status = 404)]
    NotFound,
    #[oai(status = 500)]
    InternalServerError,
}

pub struct WebRtcApi {
    pub state: Arc<AppState>,
}

#[OpenApi]
impl WebRtcApi {
    /// Join a voice channel
    #[oai(path = "/channels/:channel_id/join", method = "post", tag = "ApiTags::WebRTC")]
    async fn join_channel(
        &self, 
        channel_id: poem_openapi::param::Path<Uuid>,
        request: Json<JoinChannelRequest>
    ) -> JoinResponse {
        // Verify channel exists
        let _channel = match Channel::find_by_id(&self.state.db, *channel_id).await {
            Ok(Some(channel)) => channel,
            Ok(None) => return JoinResponse::NotFound,
            Err(_) => return JoinResponse::InternalServerError,
        };

        // Ensure mediasoup room exists
        if let Err(e) = self.state.mediasoup.get_or_create_room(*channel_id).await {
            tracing::error!("Failed to create mediasoup room: {}", e);
            return JoinResponse::InternalServerError;
        }

        // Create participant
        let peer_id = Uuid::new_v4().to_string();
        let participant = Participant::new(
            *channel_id,
            request.user_id.clone(),
            peer_id,
            request.display_name.clone(),
        );

        // Add participant to service
        self.state.participants.add_participant(*channel_id, participant.clone());

        JoinResponse::Ok(Json(participant))
    }

    /// Leave a voice channel
    #[oai(path = "/channels/:channel_id/leave", method = "post", tag = "ApiTags::WebRTC")]
    async fn leave_channel(
        &self,
        _channel_id: poem_openapi::param::Path<Uuid>,
    ) -> WebRtcResponse<serde_json::Value> {
        // TODO: Remove participant from channel
        // For now, we don't have participant identification in this endpoint
        
        WebRtcResponse::Ok(Json(serde_json::json!({"success": true})))
    }

    /// Get router RTP capabilities
    #[oai(path = "/channels/:channel_id/rtp-capabilities", method = "get", tag = "ApiTags::WebRTC")]
    async fn get_rtp_capabilities(
        &self,
        channel_id: poem_openapi::param::Path<Uuid>,
    ) -> WebRtcResponse<RtpCapabilities> {
        // Ensure room exists
        if let Err(e) = self.state.mediasoup.get_or_create_room(*channel_id).await {
            tracing::error!("Failed to get or create room: {}", e);
            return WebRtcResponse::InternalServerError;
        }

        match self.state.mediasoup.get_router_rtp_capabilities(*channel_id) {
            Ok(capabilities) => WebRtcResponse::Ok(Json(capabilities)),
            Err(e) => {
                tracing::error!("Failed to get RTP capabilities: {}", e);
                WebRtcResponse::InternalServerError
            }
        }
    }

    /// Create WebRTC transport
    #[oai(path = "/channels/:channel_id/transports", method = "post", tag = "ApiTags::WebRTC")]
    async fn create_transport(
        &self,
        channel_id: poem_openapi::param::Path<Uuid>,
        request: Json<CreateTransportRequest>,
    ) -> WebRtcResponse<TransportInfo> {
        match self.state.mediasoup.create_webrtc_transport(
            *channel_id,
            request.producing,
            request.consuming,
        ).await {
            Ok(transport_info) => WebRtcResponse::Ok(Json(transport_info)),
            Err(e) => {
                tracing::error!("Failed to create WebRTC transport: {}", e);
                WebRtcResponse::InternalServerError
            }
        }
    }

    /// Connect WebRTC transport
    #[oai(path = "/transports/:transport_id/connect", method = "post", tag = "ApiTags::WebRTC")]
    async fn connect_transport(
        &self,
        transport_id: poem_openapi::param::Path<String>,
        _request: Json<ConnectTransportRequest>,
    ) -> WebRtcResponse<serde_json::Value> {
        // TODO: We need to track which channel this transport belongs to
        // For now, we'll just log and return success
        tracing::info!("Connecting transport {}", transport_id.as_str());
        
        WebRtcResponse::Ok(Json(serde_json::json!({"success": true})))
    }

    /// Start producing media
    #[oai(path = "/transports/:transport_id/produce", method = "post", tag = "ApiTags::WebRTC")]
    async fn produce(
        &self,
        transport_id: poem_openapi::param::Path<String>,
        request: Json<ProduceRequest>,
    ) -> WebRtcResponse<ProduceResponse> {
        // TODO: Create actual mediasoup producer
        // For now, return a dummy producer ID
        let producer_id = Uuid::new_v4().to_string();
        tracing::info!("Creating producer {} for {} on transport {}", 
                      producer_id, request.kind, transport_id.as_str());

        let response = ProduceResponse {
            producer_id,
        };

        WebRtcResponse::Ok(Json(response))
    }

    /// Start consuming media
    #[oai(path = "/transports/:transport_id/consume", method = "post", tag = "ApiTags::WebRTC")]
    async fn consume(
        &self,
        transport_id: poem_openapi::param::Path<String>,
        request: Json<ConsumeRequest>,
    ) -> WebRtcResponse<ConsumeResponse> {
        // TODO: Create actual mediasoup consumer
        let consumer_id = Uuid::new_v4().to_string();
        tracing::info!("Creating consumer {} for producer {} on transport {}", 
                      consumer_id, request.producer_id, transport_id.as_str());

        let response = ConsumeResponse {
            consumer_id,
            producer_id: request.producer_id.clone(),
            kind: "audio".to_string(), // TODO: Get actual kind from producer
            rtp_parameters: serde_json::json!({}), // TODO: Return actual RTP parameters
        };

        WebRtcResponse::Ok(Json(response))
    }

    /// Update participant media state
    #[oai(path = "/participants/:participant_id", method = "patch", tag = "ApiTags::WebRTC")]
    async fn update_participant(
        &self,
        participant_id: poem_openapi::param::Path<Uuid>,
        request: Json<ParticipantUpdate>,
    ) -> WebRtcResponse<serde_json::Value> {
        // TODO: Find which channel this participant belongs to
        // For now, we'll iterate through all channels
        let mut updated = false;
        
        // This is inefficient but works for the initial implementation
        for channel_ref in self.state.participants.participants.iter() {
            let channel_id = *channel_ref.key();
            if let Some(_participant) = self.state.participants.update_participant_media_state(
                channel_id,
                *participant_id,
                request.is_audio_enabled,
                request.is_video_enabled,
            ) {
                updated = true;
                tracing::info!("Updated participant {} media state", *participant_id);
                break;
            }
        }

        if updated {
            WebRtcResponse::Ok(Json(serde_json::json!({"success": true})))
        } else {
            WebRtcResponse::NotFound
        }
    }

    /// Get channel participants
    #[oai(path = "/channels/:channel_id/participants", method = "get", tag = "ApiTags::WebRTC")]
    async fn get_participants(
        &self,
        channel_id: poem_openapi::param::Path<Uuid>,
    ) -> WebRtcResponse<Vec<Participant>> {
        let participants = self.state.participants.get_channel_participants(*channel_id);
        WebRtcResponse::Ok(Json(participants))
    }
}

use poem_openapi::Tags;

#[derive(Tags)]
enum ApiTags {
    /// WebRTC and media routing endpoints
    WebRTC,
} 