use anyhow::{anyhow, Result};
use sqlx::PgPool;
use uuid::Uuid;
use webauthn_rs::{prelude::*, Webauthn};
use webauthn_rs_proto::ResidentKeyRequirement;
// WebAuthn types are handled as JSON values for API serialization

use crate::models::{
    webauthn::{
        WebAuthnChallenge, ChallengeType, UserCredential,
        RegisterBeginRequest, RegisterBeginResponse,
        RegisterFinishRequest, RegisterFinishResponse,
        LoginBeginRequest, LoginBeginResponse,
        LoginFinishRequest, LoginFinishResponse,
    },
    user::{User, CreateUserRequest, UserAuthResponse},
    invitation::Invitation,
    instance_settings::InstanceSettings,
};

pub struct WebAuthnService {
    webauthn: Webauthn,
    instance_fqdn: String,
}

impl WebAuthnService {
    pub fn new(origin: &str, rp_id: &str, instance_fqdn: String) -> Result<Self> {
        let rp_origin = Url::parse(origin)?;
        let builder = WebauthnBuilder::new(rp_id, &rp_origin)?;
        let webauthn = builder
            .rp_name("Voice Channel")
            .build()?;

        Ok(Self {
            webauthn,
            instance_fqdn,
        })
    }

    /// Start registration process
    pub async fn register_begin(
        &self,
        pool: &PgPool,
        request: RegisterBeginRequest,
    ) -> Result<RegisterBeginResponse> {
        // Check registration mode and validate invite if needed
        let settings = InstanceSettings::get_or_create_default(pool, &self.instance_fqdn).await?;
        
        match settings.registration_mode.as_str() {
            "open" => {
                tracing::info!("Open registration for display_name: {}", request.display_name);
            }
            "invite-only" => {
                let invite_code = request.invite_code.clone()
                    .ok_or_else(|| anyhow!("Invite code required for registration"))?;
                
                let invitation = Invitation::find_by_code(pool, &invite_code).await?
                    .ok_or_else(|| anyhow!("Invalid invite code"))?;
                
                if !invitation.is_valid() {
                    return Err(anyhow!("Invite code expired or exhausted"));
                }
                
                tracing::info!("Invite-only registration with code: {}", invite_code);
            }
            _ => return Err(anyhow!("Registration not allowed")),
        }

        // Generate a unique ID for the challenge
        let user_unique_id = Uuid::new_v4();
        
        // Start WebAuthn registration with resident key requirements
        let (mut ccr, reg_state) = self.webauthn.start_passkey_registration(
            user_unique_id,
            &request.display_name,
            &request.display_name,
            None,
        )?;

        // Force discoverable credentials for usernameless authentication
        if let Some(ref mut auth_sel) = ccr.public_key.authenticator_selection {
            auth_sel.require_resident_key = true;
            auth_sel.resident_key = Some(ResidentKeyRequirement::Required);
        }

        // Store challenge state in database (using base64 encoding for binary data)
        let challenge_id = Uuid::new_v4().to_string();
        let challenge_data = base64::encode(bincode::serialize(&reg_state)
            .map_err(|e| anyhow!("Failed to serialize registration state: {}", e))?);
        
        WebAuthnChallenge::create(
            pool,
            challenge_id.clone(),
            None, // No user_id during registration
            challenge_data,
            ChallengeType::Registration,
            Some(request.display_name),
            request.invite_code,
        ).await?;

        Ok(RegisterBeginResponse {
            challenge_id,
            options: serde_json::to_value(ccr)?,
        })
    }

    /// Finish registration process
    pub async fn register_finish(
        &self,
        pool: &PgPool,
        request: RegisterFinishRequest,
    ) -> Result<RegisterFinishResponse> {
        // Get challenge from database
        let challenge = WebAuthnChallenge::find_by_challenge_id(pool, &request.challenge_id).await?
            .ok_or_else(|| anyhow!("Invalid or expired challenge"))?;

        if !matches!(challenge.challenge_type, ChallengeType::Registration) {
            return Err(anyhow!("Invalid challenge type"));
        }

        // Deserialize registration state
        let challenge_bytes = base64::decode(&challenge.challenge_data)
            .map_err(|e| anyhow!("Failed to decode challenge data: {}", e))?;
        let reg_state: PasskeyRegistration = bincode::deserialize(&challenge_bytes)
            .map_err(|e| anyhow!("Failed to deserialize registration state: {}", e))?;
        
        // Parse the credential from the frontend response
        let register_pk_credential: RegisterPublicKeyCredential = serde_json::from_value(request.credential)
            .map_err(|e| anyhow!("Invalid credential format: {}", e))?;

        // Verify the registration using webauthn-rs
        let passkey = self.webauthn.finish_passkey_registration(&register_pk_credential, &reg_state)
            .map_err(|e| anyhow!("Registration verification failed: {:?}", e))?;

        // Validate invite again if needed
        if let Some(invite_code) = &challenge.invite_code {
            let invitation = Invitation::find_by_code(pool, invite_code).await?
                .ok_or_else(|| anyhow!("Invite code no longer valid"))?;
            
            if !invitation.is_valid() {
                return Err(anyhow!("Invite code expired or exhausted"));
            }
        }

        // Create user account
        let display_name = challenge.display_name.unwrap_or_else(|| "Unknown User".to_string());
        let create_user_request = CreateUserRequest {
            display_name: display_name.clone(),
            instance_fqdn: self.instance_fqdn.clone(),
        };

        let user_response = User::create(pool, create_user_request).await?;
        let user = user_response.user;

        // Use the invitation if provided
        if let Some(invite_code) = &challenge.invite_code {
            Invitation::use_invitation(pool, invite_code, user.id).await?;
        }

        // Store the verified credential (serialize passkey as JSON for storage)
        let credential_id = passkey.cred_id().to_vec();
        let public_key = bincode::serialize(&passkey)
            .map_err(|e| anyhow!("Failed to serialize passkey: {}", e))?;

        UserCredential::create(
            pool,
            user.id,
            credential_id,
            public_key,
            0,
            Some(format!("{}'s Passkey", display_name)),
        ).await?;

        // Clean up challenge
        WebAuthnChallenge::delete(pool, &request.challenge_id).await?;

        tracing::info!("Successfully registered user {} with verified passkey", user.username);

        Ok(RegisterFinishResponse {
            user,
            is_new: true,
        })
    }

    /// Start authentication process
    pub async fn login_begin(
        &self,
        pool: &PgPool,
        _request: LoginBeginRequest,
    ) -> Result<LoginBeginResponse> {
        // For resident key authentication, use empty allowCredentials for usernameless auth
        let (rcr, auth_state) = self.webauthn.start_passkey_authentication(&[])?;

        // Store challenge state in database
        let challenge_id = Uuid::new_v4().to_string();
        let challenge_data = base64::encode(bincode::serialize(&auth_state)
            .map_err(|e| anyhow!("Failed to serialize authentication state: {}", e))?);
        
        WebAuthnChallenge::create(
            pool,
            challenge_id.clone(),
            None, // No user ID yet
            challenge_data,
            ChallengeType::Authentication,
            None,
            None,
        ).await?;

        Ok(LoginBeginResponse {
            challenge_id,
            options: serde_json::to_value(rcr)?,
        })
    }

    /// Finish authentication process
    pub async fn login_finish(
        &self,
        pool: &PgPool,
        request: LoginFinishRequest,
    ) -> Result<LoginFinishResponse> {
        // Get challenge from database
        let challenge = WebAuthnChallenge::find_by_challenge_id(pool, &request.challenge_id).await?
            .ok_or_else(|| anyhow!("Invalid or expired challenge"))?;

        if !matches!(challenge.challenge_type, ChallengeType::Authentication) {
            return Err(anyhow!("Invalid challenge type"));
        }

        // Deserialize authentication state
        let challenge_bytes = base64::decode(&challenge.challenge_data)
            .map_err(|e| anyhow!("Failed to decode challenge data: {}", e))?;
        let auth_state: PasskeyAuthentication = bincode::deserialize(&challenge_bytes)
            .map_err(|e| anyhow!("Failed to deserialize authentication state: {}", e))?;

        // Parse the authentication credential from frontend
        let auth_pk_credential: PublicKeyCredential = serde_json::from_value(request.credential)
            .map_err(|e| anyhow!("Invalid authentication credential format: {}", e))?;

        // Extract credential ID to find the stored passkey
        let credential_id = auth_pk_credential.raw_id.as_ref();
        
        // Find the stored credential
        let stored_credential = UserCredential::find_by_credential_id(pool, credential_id).await?
            .ok_or_else(|| anyhow!("Credential not found"))?;

        // Deserialize the stored passkey
        let stored_passkey: Passkey = bincode::deserialize(&stored_credential.public_key)
            .map_err(|e| anyhow!("Failed to deserialize stored passkey: {}", e))?;

        // Verify the authentication using webauthn-rs
        let auth_result = self.webauthn.finish_passkey_authentication(&auth_pk_credential, &auth_state)
            .map_err(|e| anyhow!("Authentication verification failed: {:?}", e))?;

        // Update credential counter
        UserCredential::update_counter(
            pool,
            &stored_credential.credential_id,
            auth_result.counter() as i64,
        ).await?;

        // Get user
        let user = User::find_by_id(pool, stored_credential.user_id).await?
            .ok_or_else(|| anyhow!("User not found"))?;

        // Clean up challenge
        WebAuthnChallenge::delete(pool, &request.challenge_id).await?;

        tracing::info!("Successfully authenticated user {} with verified credential", user.username);

        Ok(LoginFinishResponse { user })
    }

    /// Get user's credentials for management
    pub async fn get_user_credentials(
        &self,
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Vec<crate::models::webauthn::CredentialInfo>> {
        let credentials = UserCredential::find_by_user_id(pool, user_id).await?;
        
        Ok(credentials.into_iter().map(|cred| {
            crate::models::webauthn::CredentialInfo {
                id: cred.id.to_string(),
                name: cred.name,
                created_at: cred.created_at,
                last_used_at: cred.last_used_at,
            }
        }).collect())
    }

    /// Delete a user's credential
    pub async fn delete_user_credential(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        credential_id: Uuid,
    ) -> Result<bool> {
        UserCredential::delete(pool, credential_id, user_id).await
    }

    /// Clean up expired challenges (should be called periodically)
    pub async fn cleanup_expired_challenges(&self, pool: &PgPool) -> Result<u64> {
        WebAuthnChallenge::cleanup_expired(pool).await
    }
} 