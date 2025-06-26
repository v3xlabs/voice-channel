use poem_openapi::{param::Path, payload::Json, OpenApi, Tags};
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    models::{
        channel::{Channel, CreateChannelRequest},
        webrtc::{
            RtpCapabilities, TransportInfo, CreateTransportRequest, ConnectTransportRequest,
            ProduceRequest, ProduceResponse, ConsumeRequest, ConsumeResponse,
        },
        participant::{JoinChannelRequest, Participant, ParticipantUpdate},
    },
    AppState,
};

pub struct Api {
    pub state: Arc<AppState>,
}

#[derive(Tags)]
enum ApiTags {
    /// Channel management
    Channels,
    /// WebRTC and media routing endpoints
    WebRTC,
}

#[OpenApi]
impl Api {
    /// Health check endpoint
    #[oai(path = "/health", method = "get", tag = "ApiTags::Channels")]
    async fn health(&self) -> poem_openapi::payload::PlainText<&'static str> {
        poem_openapi::payload::PlainText("OK")
    }

    /// List all channels
    #[oai(path = "/channels", method = "get", tag = "ApiTags::Channels")]
    async fn list_channels(&self) -> poem_openapi::payload::Json<Vec<Channel>> {
        match Channel::list_all(&self.state.db).await {
            Ok(channels) => poem_openapi::payload::Json(channels),
            Err(_) => poem_openapi::payload::Json(vec![]),
        }
    }

    /// Create a new channel
    #[oai(path = "/channels", method = "post", tag = "ApiTags::Channels")]
    async fn create_channel(
        &self,
        request: Json<CreateChannelRequest>,
    ) -> poem_openapi::payload::Json<Channel> {
        let channel = Channel::create(&self.state.db, request.0, self.state.config.instance_fqdn.clone())
            .await
            .expect("Failed to create channel");
        poem_openapi::payload::Json(channel)
    }

    /// Get a specific channel
    #[oai(path = "/channels/:id", method = "get", tag = "ApiTags::Channels")]
    async fn get_channel(&self, id: Path<Uuid>) -> poem_openapi::payload::Json<Option<Channel>> {
        match Channel::find_by_id(&self.state.db, *id).await {
            Ok(channel) => poem_openapi::payload::Json(channel),
            Err(_) => poem_openapi::payload::Json(None),
        }
    }

    // WebRTC Endpoints

    /// Join a voice channel
    #[oai(path = "/channels/:channel_id/join", method = "post", tag = "ApiTags::WebRTC")]
    async fn join_channel(
        &self, 
        channel_id: Path<Uuid>,
        request: Json<JoinChannelRequest>
    ) -> poem_openapi::payload::Json<Participant> {
        // Verify channel exists
        let _channel = Channel::find_by_id(&self.state.db, *channel_id).await
            .expect("Failed to query channel");

        // Ensure mediasoup room exists
        self.state.mediasoup.get_or_create_room(*channel_id).await
            .expect("Failed to create mediasoup room");

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

        poem_openapi::payload::Json(participant)
    }

    /// Get router RTP capabilities
    #[oai(path = "/channels/:channel_id/rtp-capabilities", method = "get", tag = "ApiTags::WebRTC")]
    async fn get_rtp_capabilities(
        &self,
        channel_id: Path<Uuid>,
    ) -> poem_openapi::payload::Json<RtpCapabilities> {
        // Ensure room exists
        self.state.mediasoup.get_or_create_room(*channel_id).await
            .expect("Failed to get or create room");

        let capabilities = self.state.mediasoup.get_router_rtp_capabilities(*channel_id)
            .expect("Failed to get RTP capabilities");
        
        poem_openapi::payload::Json(capabilities)
    }

    /// Create WebRTC transport
    #[oai(path = "/channels/:channel_id/transports", method = "post", tag = "ApiTags::WebRTC")]
    async fn create_transport(
        &self,
        channel_id: Path<Uuid>,
        request: Json<CreateTransportRequest>,
    ) -> poem_openapi::payload::Json<TransportInfo> {
        let transport_info = self.state.mediasoup.create_webrtc_transport(
            *channel_id,
            request.producing,
            request.consuming,
        ).await.expect("Failed to create WebRTC transport");

        poem_openapi::payload::Json(transport_info)
    }

    /// Connect WebRTC transport
    #[oai(path = "/transports/:transport_id/connect", method = "post", tag = "ApiTags::WebRTC")]
    async fn connect_transport(
        &self,
        transport_id: Path<String>,
        _request: Json<ConnectTransportRequest>,
    ) -> poem_openapi::payload::Json<serde_json::Value> {
        tracing::info!("Connecting transport {}", transport_id.as_str());
        poem_openapi::payload::Json(serde_json::json!({"success": true}))
    }

    /// Start producing media
    #[oai(path = "/transports/:transport_id/produce", method = "post", tag = "ApiTags::WebRTC")]
    async fn produce(
        &self,
        transport_id: Path<String>,
        request: Json<ProduceRequest>,
    ) -> poem_openapi::payload::Json<ProduceResponse> {
        let producer_id = Uuid::new_v4().to_string();
        tracing::info!("Creating producer {} for {} on transport {}", 
                      producer_id, request.kind, transport_id.as_str());

        let response = ProduceResponse {
            producer_id,
        };

        poem_openapi::payload::Json(response)
    }

    /// Start consuming media
    #[oai(path = "/transports/:transport_id/consume", method = "post", tag = "ApiTags::WebRTC")]
    async fn consume(
        &self,
        transport_id: Path<String>,
        request: Json<ConsumeRequest>,
    ) -> poem_openapi::payload::Json<ConsumeResponse> {
        let consumer_id = Uuid::new_v4().to_string();
        tracing::info!("Creating consumer {} for producer {} on transport {}", 
                      consumer_id, request.producer_id, transport_id.as_str());

        let response = ConsumeResponse {
            consumer_id,
            producer_id: request.producer_id.clone(),
            kind: "audio".to_string(),
            rtp_parameters: serde_json::json!({}),
        };

        poem_openapi::payload::Json(response)
    }

    /// Get channel participants
    #[oai(path = "/channels/:channel_id/participants", method = "get", tag = "ApiTags::WebRTC")]
    async fn get_participants(
        &self,
        channel_id: Path<Uuid>,
    ) -> poem_openapi::payload::Json<Vec<Participant>> {
        let participants = self.state.participants.get_channel_participants(*channel_id);
        poem_openapi::payload::Json(participants)
    }

    /// Update participant media state
    #[oai(path = "/participants/:participant_id", method = "patch", tag = "ApiTags::WebRTC")]
    async fn update_participant(
        &self,
        participant_id: Path<Uuid>,
        request: Json<ParticipantUpdate>,
    ) -> poem_openapi::payload::Json<serde_json::Value> {
        // Find which channel this participant belongs to
        let mut updated = false;
        
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
            poem_openapi::payload::Json(serde_json::json!({"success": true}))
        } else {
            poem_openapi::payload::Json(serde_json::json!({"error": "Participant not found"}))
        }
    }
} 