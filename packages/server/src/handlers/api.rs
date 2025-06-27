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
        user::{User, CreateUserRequest, UpdateUserRequest, UserAuthResponse},
        membership::{ChannelMembership, ChannelWithMembership, JoinChannelMembershipRequest},
        instance_settings::InstanceSettings,
        invitation::Invitation,
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
    /// User authentication and management
    Auth,
    /// Instance administration
    Admin,
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
        match Channel::list_all(&self.state.db.pool).await {
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
        let channel = Channel::create(&self.state.db.pool, request.0, self.state.config.instance_fqdn.clone())
            .await
            .expect("Failed to create channel");
        poem_openapi::payload::Json(channel)
    }

    /// Get a specific channel by ID
    #[oai(path = "/channels/id/:id", method = "get", tag = "ApiTags::Channels")]
    async fn get_channel_by_id(&self, id: Path<Uuid>) -> poem_openapi::payload::Json<Option<Channel>> {
        match Channel::find_by_id(&self.state.db.pool, *id).await {
            Ok(channel) => poem_openapi::payload::Json(channel),
            Err(_) => poem_openapi::payload::Json(None),
        }
    }

    /// Get a specific channel by name
    #[oai(path = "/channels/name/:name", method = "get", tag = "ApiTags::Channels")]
    async fn get_channel_by_name(&self, name: Path<String>) -> poem_openapi::payload::Json<Option<Channel>> {
        match Channel::find_by_name(&self.state.db.pool, &name).await {
            Ok(channel) => poem_openapi::payload::Json(channel),
            Err(_) => poem_openapi::payload::Json(None),
        }
    }

    // WebRTC Endpoints

    /// Join a voice channel
    #[oai(path = "/channels/:channel_name/join", method = "post", tag = "ApiTags::WebRTC")]
    async fn join_channel(
        &self, 
        channel_name: Path<String>,
        request: Json<JoinChannelRequest>
    ) -> poem_openapi::payload::Json<Participant> {
        // Find channel by name
        let channel = Channel::find_by_name(&self.state.db.pool, &channel_name).await
            .expect("Failed to query channel")
            .expect("Channel not found");

        // Ensure mediasoup room exists
        self.state.mediasoup.get_or_create_room(channel.id).await
            .expect("Failed to create mediasoup room");

        // Create participant
        let peer_id = Uuid::new_v4().to_string();
        let participant = Participant::new(
            channel.id,
            request.user_id.clone(),
            peer_id,
            request.display_name.clone(),
        );

        // Add participant to service
        self.state.participants.add_participant(channel.id, participant.clone());

        poem_openapi::payload::Json(participant)
    }

    /// Get router RTP capabilities
    #[oai(path = "/channels/:channel_name/rtp-capabilities", method = "get", tag = "ApiTags::WebRTC")]
    async fn get_rtp_capabilities(
        &self,
        channel_name: Path<String>,
    ) -> poem_openapi::payload::Json<RtpCapabilities> {
        // Find channel by name
        let channel = Channel::find_by_name(&self.state.db.pool, &channel_name).await
            .expect("Failed to query channel")
            .expect("Channel not found");

        // Ensure room exists
        self.state.mediasoup.get_or_create_room(channel.id).await
            .expect("Failed to get or create room");

        let capabilities = self.state.mediasoup.get_router_rtp_capabilities(channel.id)
            .expect("Failed to get RTP capabilities");
        
        poem_openapi::payload::Json(capabilities)
    }

    /// Create WebRTC transport
    #[oai(path = "/channels/:channel_name/transports", method = "post", tag = "ApiTags::WebRTC")]
    async fn create_transport(
        &self,
        channel_name: Path<String>,
        request: Json<CreateTransportRequest>,
    ) -> poem_openapi::payload::Json<TransportInfo> {
        // Find channel by name
        let channel = Channel::find_by_name(&self.state.db.pool, &channel_name).await
            .expect("Failed to query channel")
            .expect("Channel not found");

        let transport_info = self.state.mediasoup.create_webrtc_transport(
            channel.id,
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
    #[oai(path = "/channels/:channel_name/participants", method = "get", tag = "ApiTags::WebRTC")]
    async fn get_participants(
        &self,
        channel_name: Path<String>,
    ) -> poem_openapi::payload::Json<Vec<Participant>> {
        // Find channel by name
        let channel = Channel::find_by_name(&self.state.db.pool, &channel_name).await
            .expect("Failed to query channel")
            .expect("Channel not found");

        let participants = self.state.participants.get_channel_participants(channel.id);
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

    // Authentication Endpoints

    /// User login/registration
    #[oai(path = "/auth/login", method = "post", tag = "ApiTags::Auth")]
    async fn login(
        &self,
        request: Json<CreateUserRequest>,
    ) -> poem_openapi::payload::Json<UserAuthResponse> {
        let result = User::create(&self.state.db.pool, request.0).await
            .expect("Failed to create user");

        poem_openapi::payload::Json(result)
    }

    /// Update user profile
    #[oai(path = "/users/:user_id", method = "patch", tag = "ApiTags::Auth")]
    async fn update_user(
        &self,
        user_id: Path<Uuid>,
        request: Json<UpdateUserRequest>,
    ) -> poem_openapi::payload::Json<User> {
        let user = User::update(&self.state.db.pool, *user_id, request.0).await
            .expect("Failed to update user");

        poem_openapi::payload::Json(user)
    }

    /// Get user profile
    #[oai(path = "/users/:user_id", method = "get", tag = "ApiTags::Auth")]
    async fn get_user(
        &self,
        user_id: Path<Uuid>,
    ) -> poem_openapi::payload::Json<Option<User>> {
        let user = User::find_by_id(&self.state.db.pool, *user_id).await
            .expect("Failed to get user");

        poem_openapi::payload::Json(user)
    }

    /// Get user's joined channels
    #[oai(path = "/users/:user_id/channels", method = "get", tag = "ApiTags::Auth")]
    async fn get_user_channels(
        &self,
        user_id: Path<Uuid>,
    ) -> poem_openapi::payload::Json<Vec<ChannelWithMembership>> {
        let channels = ChannelMembership::get_user_channels(
            &self.state.db.pool, 
            *user_id, 
            &self.state.config.instance_fqdn
        ).await.expect("Failed to get user channels");

        poem_openapi::payload::Json(channels)
    }

    /// Join a channel (become a member)
    #[oai(path = "/channels/:channel_instance_fqdn/:channel_name/members", method = "post", tag = "ApiTags::Channels")]
    async fn join_channel_membership(
        &self,
        channel_instance_fqdn: Path<String>,
        channel_name: Path<String>,
        request: Json<JoinChannelMembershipRequest>,
    ) -> poem_openapi::payload::Json<ChannelMembership> {
        let membership = ChannelMembership::join_channel(
            &self.state.db.pool,
            request.user_id,
            channel_instance_fqdn.to_string(),
            channel_name.to_string(),
        ).await.expect("Failed to join channel");

        poem_openapi::payload::Json(membership)
    }

    /// Leave a channel (remove membership)
    #[oai(path = "/channels/:channel_instance_fqdn/:channel_name/members/:user_id", method = "delete", tag = "ApiTags::Channels")]
    async fn leave_channel_membership(
        &self,
        channel_instance_fqdn: Path<String>,
        channel_name: Path<String>,
        user_id: Path<Uuid>,
    ) -> poem_openapi::payload::Json<serde_json::Value> {
        let success = ChannelMembership::leave_channel(
            &self.state.db.pool, 
            *user_id, 
            channel_instance_fqdn.to_string(),
            channel_name.to_string()
        ).await.expect("Failed to leave channel");

        poem_openapi::payload::Json(serde_json::json!({ "success": success }))
    }

    /// Get channel members
    #[oai(path = "/channels/:channel_instance_fqdn/:channel_name/members", method = "get", tag = "ApiTags::Channels")]
    async fn get_channel_members(
        &self,
        channel_instance_fqdn: Path<String>,
        channel_name: Path<String>,
    ) -> poem_openapi::payload::Json<Vec<User>> {
        let members = ChannelMembership::get_channel_members(
            &self.state.db.pool, 
            channel_instance_fqdn.to_string(),
            channel_name.to_string()
        ).await.expect("Failed to get channel members");

        poem_openapi::payload::Json(members)
    }

    // Admin Endpoints

    /// Get instance settings
    #[oai(path = "/admin/settings", method = "get", tag = "ApiTags::Admin")]
    async fn get_instance_settings(
        &self,
    ) -> poem_openapi::payload::Json<InstanceSettings> {
        let settings = InstanceSettings::get_or_create_default(&self.state.db.pool, &self.state.config.instance_fqdn)
            .await
            .expect("Failed to get instance settings");

        poem_openapi::payload::Json(settings)
    }

    /// Check if registration is open
    #[oai(path = "/admin/registration-status", method = "get", tag = "ApiTags::Admin")]
    async fn get_registration_status(
        &self,
    ) -> poem_openapi::payload::Json<serde_json::Value> {
        let settings = InstanceSettings::get_or_create_default(&self.state.db.pool, &self.state.config.instance_fqdn)
            .await
            .expect("Failed to get instance settings");

        poem_openapi::payload::Json(serde_json::json!({
            "registration_open": settings.is_registration_open(),
            "registration_mode": settings.registration_mode,
            "invite_permission": settings.invite_permission,
            "instance_name": settings.instance_name
        }))
    }

    /// Get invitation details by code (for registration page)
    #[oai(path = "/invitations/:invite_code", method = "get", tag = "ApiTags::Admin")]
    async fn get_invitation_by_code(
        &self,
        invite_code: Path<String>,
    ) -> poem_openapi::payload::Json<Option<Invitation>> {
        let invitation = Invitation::find_by_code(&self.state.db.pool, &invite_code)
            .await
            .expect("Failed to get invitation");

        // Only return if invitation is valid
        if let Some(inv) = invitation {
            if inv.is_valid() {
                poem_openapi::payload::Json(Some(inv))
            } else {
                poem_openapi::payload::Json(None)
            }
        } else {
            poem_openapi::payload::Json(None)
        }
    }
} 