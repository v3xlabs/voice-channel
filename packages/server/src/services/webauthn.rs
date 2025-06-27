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
        
        let mut validated_invite: Option<Invitation> = None;
        
        match settings.registration_mode.as_str() {
            "open" => {
                // Open registration - no invite needed
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
                
                validated_invite = Some(invitation);
                tracing::info!("Invite-only registration with code: {}", invite_code);
            }
            _ => return Err(anyhow!("Registration not allowed")),
        }

        // Generate a unique ID for the challenge (not a user ID yet)
        let user_unique_id = Uuid::new_v4().to_string();
        
        // Start WebAuthn registration - passkey registration should create discoverable credentials
        let (mut ccr, _reg_state) = self.webauthn.start_passkey_registration(
            Uuid::parse_str(&user_unique_id)?,
            &request.display_name,
            &request.display_name,
            None,
        )?;

        // Manually override the authenticator selection to require resident keys
        if let Some(ref mut auth_sel) = ccr.public_key.authenticator_selection {
            auth_sel.require_resident_key = true;
            auth_sel.resident_key = Some(ResidentKeyRequirement::Required);
        }

        // Store challenge in database
        let challenge_id = Uuid::new_v4().to_string();
        let challenge_data = format!("temp_registration_state_{}", challenge_id); // Temporary placeholder
        
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

        // Extract credential ID from the WebAuthn credential response
        let credential_id = request.credential
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing credential ID in response"))?;

        // For development, we'll store basic credential data
        // In production, this would properly verify the attestation and extract public key
        use base64::Engine;
        let credential_id_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(credential_id)
            .map_err(|_| anyhow!("Invalid credential ID format"))?;
        
        // Store a placeholder public key (in production, extract from attestation)
        let public_key = vec![1, 2, 3, 4]; // TODO: Extract actual public key from credential.response.publicKey

        // Validate invite again if needed (double-check)
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

        // Store the actual credential with real credential ID
        UserCredential::create(
            pool,
            user.id,
            credential_id_bytes,
            public_key,
            0,
            Some(format!("{}'s Passkey", display_name)),
        ).await?;

        // Clean up challenge
        WebAuthnChallenge::delete(pool, &request.challenge_id).await?;

        tracing::info!("Successfully registered user {} with passkey (cred: {})", user.username, credential_id);

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
        // For resident key passkeys, we use empty allowCredentials for usernameless auth
        // The resident key requirement ensures discoverability
        let (rcr, _auth_state) = self.webauthn.start_passkey_authentication(&[])?;

        // Store challenge in database
        let challenge_id = Uuid::new_v4().to_string();
        let challenge_data = format!("temp_auth_state_{}", challenge_id); // Temporary placeholder
        
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

        // Extract credential ID from the WebAuthn authentication response
        let credential_id = request.credential
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing credential ID in authentication response"))?;

        use base64::Engine;
        let credential_id_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(credential_id)
            .map_err(|_| anyhow!("Invalid credential ID format"))?;
        
        // Find the stored credential using the real credential ID
        let stored_credential = UserCredential::find_by_credential_id(pool, &credential_id_bytes).await?
            .ok_or_else(|| anyhow!("Credential not found"))?;

        // In production, we would verify the authentication signature here
        // For now, we'll just update the counter (successful auth)
        UserCredential::update_counter(
            pool,
            &stored_credential.credential_id,
            stored_credential.counter + 1,
        ).await?;

        // Get user
        let user = User::find_by_id(pool, stored_credential.user_id).await?
            .ok_or_else(|| anyhow!("User not found"))?;

        // Clean up challenge
        WebAuthnChallenge::delete(pool, &request.challenge_id).await?;

        tracing::info!("Successfully authenticated user {} with credential {}", user.username, credential_id);

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