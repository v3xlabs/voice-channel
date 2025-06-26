use poem_openapi::{payload::Json, OpenApi, param::Path};
use uuid::Uuid;

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

    // Helper method to create a new participant
    fn create_participant(&self, channel_id: Uuid, user_id: String, display_name: String) -> Participant {
        let participant = Participant::new(
            channel_id,
            user_id,
            Uuid::new_v4().to_string(), // peer_id
            display_name,
        );
        
        self.participant_service.add_participant(channel_id, participant.clone());
        participant
    }
}

#[OpenApi]
impl WebRtcApi {
    /// Join a voice channel
    #[oai(path = "/api/channels/:id/join", method = "post")]
    async fn join_channel(
        &self,
        id: Path<Uuid>,
        request: Json<ParticipantJoinRequest>,
    ) -> poem_openapi::payload::Json<ParticipantJoinResponse> {
        let channel_id = *id;
        
        // Ensure room exists
        self.mediasoup_service.get_or_create_room(channel_id).await
            .expect("Failed to create mediasoup room");

        // Create and add participant
        let participant = self.create_participant(
            channel_id,
            request.user_id.clone(),
            request.display_name.clone(),
        );

        let response = ParticipantJoinResponse {
            participant_id: participant.id.to_string(),
            user_id: participant.user_id,
            display_name: participant.display_name,
            audio_enabled: participant.is_audio_enabled,
            video_enabled: participant.is_video_enabled,
        };

        poem_openapi::payload::Json(response)
    }

    /// Leave a voice channel
    #[oai(path = "/api/channels/:id/leave", method = "post")]
    async fn leave_channel(
        &self,
        id: Path<Uuid>,
        request: Json<ParticipantLeaveRequest>,
    ) -> poem_openapi::payload::Json<ParticipantLeaveResponse> {
        let channel_id = *id;
        
        // Parse participant_id as UUID
        if let Ok(participant_id) = uuid::Uuid::parse_str(&request.participant_id) {
            self.participant_service.remove_participant(channel_id, participant_id);
        }

        let response = ParticipantLeaveResponse {
            success: true,
        };

        poem_openapi::payload::Json(response)
    }

    /// Get router RTP capabilities for a channel
    #[oai(path = "/api/channels/:id/rtp-capabilities", method = "get")]
    async fn get_router_rtp_capabilities(
        &self,
        id: Path<Uuid>,
    ) -> poem_openapi::payload::Json<RtpCapabilities> {
        let channel_id = *id;
        
        // Ensure room exists
        self.mediasoup_service.get_or_create_room(channel_id).await
            .expect("Failed to create mediasoup room");

        let capabilities = self.mediasoup_service.get_router_rtp_capabilities(channel_id)
            .expect("Failed to get RTP capabilities");

        poem_openapi::payload::Json(capabilities)
    }

    /// Create WebRTC transport for a channel
    #[oai(path = "/api/channels/:id/transports", method = "post")]
    async fn create_transport(
        &self,
        id: Path<Uuid>,
        request: Json<CreateTransportRequest>,
    ) -> poem_openapi::payload::Json<TransportInfo> {
        let channel_id = *id;

        let transport_info = self.mediasoup_service.create_webrtc_transport(
            channel_id,
            request.producing,
            request.consuming,
        ).await.expect("Failed to create WebRTC transport");

        poem_openapi::payload::Json(transport_info)
    }

    /// Connect a WebRTC transport
    #[oai(path = "/api/transports/:id/connect", method = "post")]
    async fn connect_transport(
        &self,
        id: Path<String>,
        request: Json<ConnectTransportRequest>,
    ) -> poem_openapi::payload::Json<ConnectTransportResponse> {
        let transport_id = id.as_str();

        self.mediasoup_service.connect_transport(
            transport_id,
            &request.dtls_parameters,
        ).await.expect("Failed to connect transport");

        let response = ConnectTransportResponse {
            success: true,
        };

        poem_openapi::payload::Json(response)
    }

    /// Start producing media on a transport
    #[oai(path = "/api/transports/:id/produce", method = "post")]
    async fn produce(
        &self,
        id: Path<String>,
        request: Json<ProduceRequest>,
    ) -> poem_openapi::payload::Json<ProduceResponse> {
        let transport_id = id.as_str();

        let producer_id = self.mediasoup_service.create_producer(
            transport_id,
            &request.kind,
            request.rtp_parameters.clone(),
        ).await.expect("Failed to create producer");

        let response = ProduceResponse {
            producer_id,
        };

        poem_openapi::payload::Json(response)
    }

    /// Start consuming media from a producer
    #[oai(path = "/api/transports/:id/consume", method = "post")]
    async fn consume(
        &self,
        id: Path<String>,
        request: Json<ConsumeRequest>,
    ) -> poem_openapi::payload::Json<ConsumeResponse> {
        let transport_id = id.as_str();

        let consume_response = self.mediasoup_service.create_consumer(
            transport_id,
            &request.producer_id,
            &request.rtp_capabilities,
        ).await.expect("Failed to create consumer");

        let response = consume_response;

        poem_openapi::payload::Json(response)
    }

    /// Update participant media state
    #[oai(path = "/api/participants/:id", method = "patch")]
    async fn update_participant(
        &self,
        id: Path<String>,
        request: Json<ParticipantUpdateRequest>,
    ) -> poem_openapi::payload::Json<ParticipantUpdateResponse> {
        // Parse participant_id as UUID
        if let Ok(participant_id) = uuid::Uuid::parse_str(id.as_str()) {
            // We need to find which channel this participant is in
            // For now, we'll iterate through all channels to find the participant
            for channel_entry in self.participant_service.participants.iter() {
                let channel_id = *channel_entry.key();
                if let Some(participant) = self.participant_service.update_participant_media_state(
                    channel_id,
                    participant_id,
                    request.audio_enabled,
                    request.video_enabled,
                ) {
                    let response = ParticipantUpdateResponse {
                        participant_id: participant.id.to_string(),
                        audio_enabled: participant.is_audio_enabled,
                        video_enabled: participant.is_video_enabled,
                    };
                    return poem_openapi::payload::Json(response);
                }
            }
        }

        // Default response if participant not found
        let response = ParticipantUpdateResponse {
            participant_id: id.to_string(),
            audio_enabled: false,
            video_enabled: false,
        };
        poem_openapi::payload::Json(response)
    }
} 