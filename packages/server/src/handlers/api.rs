use poem_openapi::{param::Path, payload::Json, OpenApi, Tags};
use std::sync::Arc;
use uuid::Uuid;
use chrono::Utc;
use poem::http::StatusCode;

use crate::{
    models::{
        channel::{Channel, CreateChannelRequest},
        webrtc::{
            RtpCapabilities, TransportInfo, CreateTransportRequest, ConnectTransportRequest,
            ProduceRequest, ProduceResponse, ConsumeRequest, ConsumeResponse,
        },
        participant::{Participant, ParticipantUpdate, JoinChannelRequest as ParticipantJoinRequest},
        user::{User, CreateUserRequest, UpdateUserRequest, UserAuthResponse},
        membership::{ChannelMembership, ChannelMembershipWithChannel, JoinChannelRequest},
        instance_settings::InstanceSettings,
        invitation::Invitation,
        webauthn::{
            RegisterBeginRequest, RegisterBeginResponse, RegisterFinishRequest, RegisterFinishResponse,
            LoginBeginRequest, LoginBeginResponse, LoginFinishRequest, LoginFinishResponse,
            CredentialInfo,
        },
    },
    AppState,
};

pub struct Api {
    pub state: Arc<AppState>,
}

#[derive(Tags)]
pub enum ApiTags {
    /// Channel management
    Channels,
    /// WebRTC and media routing endpoints
    WebRTC,
    /// User authentication and management
    Auth,
    /// Instance administration
    Admin,
    /// Bootstrap setup for new instances
    Setup,
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
        request: Json<ParticipantJoinRequest>
    ) -> poem_openapi::payload::Json<Participant> {
        // Find channel by name
        let channel = Channel::find_by_name(&self.state.db.pool, &channel_name).await
            .expect("Failed to query channel")
            .expect("Channel not found");

        // Get user information
        let user_uuid = Uuid::parse_str(&request.user_id)
            .expect("Invalid user ID format");
        let user = User::find_by_id(&self.state.db.pool, user_uuid).await
            .expect("Failed to query user")
            .expect("User not found");

        // Ensure mediasoup room exists
        self.state.mediasoup.get_or_create_room(channel.channel_id).await
            .expect("Failed to create mediasoup room");

        // Create participant using user's display name
        let peer_id = Uuid::new_v4().to_string();
        let participant = Participant::new(
            channel.channel_id,
            request.user_id.clone(),
            peer_id,
            user.display_name,
        );

        // Add participant to service
        self.state.participants.add_participant(channel.channel_id, participant.clone());

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
        self.state.mediasoup.get_or_create_room(channel.channel_id).await
            .expect("Failed to get or create room");

        let capabilities = self.state.mediasoup.get_router_rtp_capabilities(channel.channel_id)
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
            channel.channel_id,
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

        let participants = self.state.participants.get_channel_participants(channel.channel_id);
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
    ) -> Result<poem_openapi::payload::Json<UserAuthResponse>, poem::Error> {
        let result = User::create(&self.state.db.pool, request.0, self.state.config.instance_fqdn.clone()).await
            .map_err(|e| poem::Error::from_string(e.to_string(), StatusCode::INTERNAL_SERVER_ERROR))?;

        Ok(Json(result))
    }

    /// Update user profile
    #[oai(path = "/users/:user_id", method = "patch", tag = "ApiTags::Auth")]
    async fn update_user(
        &self,
        user_id: Path<Uuid>,
        request: Json<UpdateUserRequest>,
    ) -> poem_openapi::payload::Json<Option<User>> {
        // For now, just return the user without updating
        // TODO: Implement User::update method
        let user = User::find_by_id(&self.state.db.pool, *user_id).await
            .expect("Failed to get user");

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
    ) -> poem_openapi::payload::Json<Vec<ChannelMembershipWithChannel>> {
        let channels = ChannelMembership::get_user_channels(
            &self.state.db.pool, 
            *user_id
        ).await.expect("Failed to get user channels");

        poem_openapi::payload::Json(channels)
    }

    /// Join a channel (become a member)
    #[oai(path = "/channels/:channel_instance_fqdn/:channel_name/members", method = "post", tag = "ApiTags::Channels")]
    async fn join_channel_membership(
        &self,
        channel_instance_fqdn: Path<String>,
        channel_name: Path<String>,
        user_id: poem_openapi::param::Query<Uuid>,
    ) -> poem_openapi::payload::Json<ChannelMembership> {
        let join_request = JoinChannelRequest {
            channel_instance_fqdn: channel_instance_fqdn.to_string(),
            channel_name: channel_name.to_string(),
        };
        
        let membership = ChannelMembership::join_channel(
            &self.state.db.pool,
            *user_id,
            join_request,
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
            &channel_instance_fqdn,
            &channel_name
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
            &channel_instance_fqdn,
            &channel_name
        ).await.expect("Failed to get channel members");

        poem_openapi::payload::Json(members)
    }

    // Admin Endpoints

    /// Get instance settings
    #[oai(path = "/admin/settings", method = "get", tag = "ApiTags::Admin")]
    async fn get_instance_settings(
        &self,
    ) -> poem_openapi::payload::Json<Option<InstanceSettings>> {
        let settings = InstanceSettings::get_by_fqdn(&self.state.db.pool, &self.state.config.instance_fqdn)
            .await
            .expect("Failed to get instance settings");

        poem_openapi::payload::Json(settings)
    }

    /// Check if registration is open
    #[oai(path = "/admin/registration-status", method = "get", tag = "ApiTags::Admin")]
    async fn get_registration_status(
        &self,
    ) -> poem_openapi::payload::Json<serde_json::Value> {
        let settings = InstanceSettings::get_by_fqdn(&self.state.db.pool, &self.state.config.instance_fqdn)
            .await
            .expect("Failed to get instance settings")
            .unwrap_or_else(|| InstanceSettings {
                settings_id: Uuid::new_v4(),
                instance_fqdn: self.state.config.instance_fqdn.clone(),
                registration_mode: "invite_only".to_string(),
                invite_permission: "admin_only".to_string(),
                invite_limit: None,
                instance_name: format!("{} Voice Channel", self.state.config.instance_fqdn),
                instance_description: None,
                created_at: chrono::Utc::now(),
                updated_at: chrono::Utc::now(),
            });

        poem_openapi::payload::Json(serde_json::json!({
            "registration_open": settings.registration_mode == "open",
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
        let invitation = Invitation::get_by_code(&self.state.db.pool, &invite_code)
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

    // WebAuthn Endpoints

    /// Start WebAuthn registration
    #[oai(path = "/auth/register/begin", method = "post", tag = "ApiTags::Auth")]
    async fn register_begin(
        &self,
        request: Json<RegisterBeginRequest>,
    ) -> poem_openapi::payload::Json<RegisterBeginResponse> {
        let result = self.state.webauthn.register_begin(&self.state.db.pool, request.0).await
            .expect("Failed to start registration");

        poem_openapi::payload::Json(result)
    }

    /// Finish WebAuthn registration
    #[oai(path = "/auth/register/finish", method = "post", tag = "ApiTags::Auth")]
    async fn register_finish(
        &self,
        request: Json<RegisterFinishRequest>,
    ) -> poem_openapi::payload::Json<RegisterFinishResponse> {
        let result = self.state.webauthn.register_finish(&self.state.db.pool, request.0).await
            .expect("Failed to finish registration");

        poem_openapi::payload::Json(result)
    }

    /// Start WebAuthn authentication
    #[oai(path = "/auth/login/begin", method = "post", tag = "ApiTags::Auth")]
    async fn login_begin(
        &self,
        request: Json<LoginBeginRequest>,
    ) -> poem_openapi::payload::Json<LoginBeginResponse> {
        let result = self.state.webauthn.login_begin(&self.state.db.pool, request.0).await
            .expect("Failed to start authentication");

        poem_openapi::payload::Json(result)
    }

    /// Finish WebAuthn authentication
    #[oai(path = "/auth/login/finish", method = "post", tag = "ApiTags::Auth")]
    async fn login_finish(
        &self,
        request: Json<LoginFinishRequest>,
    ) -> poem_openapi::payload::Json<LoginFinishResponse> {
        let result = self.state.webauthn.login_finish(&self.state.db.pool, request.0).await
            .expect("Failed to finish authentication");

        poem_openapi::payload::Json(result)
    }

    /// Get user's credentials
    #[oai(path = "/auth/credentials", method = "get", tag = "ApiTags::Auth")]
    async fn get_user_credentials(
        &self,
        user_id: poem_openapi::param::Query<String>,
    ) -> poem_openapi::payload::Json<Vec<CredentialInfo>> {
        let user_uuid = Uuid::parse_str(&user_id.0)
            .expect("Invalid user ID format");

        let credentials = self.state.webauthn.get_user_credentials(&self.state.db.pool, user_uuid).await
            .expect("Failed to get user credentials");

        poem_openapi::payload::Json(credentials)
    }

    /// Delete a user's credential
    #[oai(path = "/auth/credentials/:credential_id", method = "delete", tag = "ApiTags::Auth")]
    async fn delete_user_credential(
        &self,
        credential_id: Path<String>,
        user_id: poem_openapi::param::Query<String>,
    ) -> poem_openapi::payload::Json<serde_json::Value> {
        let user_uuid = Uuid::parse_str(&user_id.0)
            .expect("Invalid user ID format");
        let credential_uuid = Uuid::parse_str(&credential_id.0)
            .expect("Invalid credential ID format");

        let success = self.state.webauthn.delete_user_credential(
            &self.state.db.pool, 
            user_uuid, 
            credential_uuid
        ).await.expect("Failed to delete credential");

        poem_openapi::payload::Json(serde_json::json!({ "success": success }))
    }
} 