use anyhow::{anyhow, Result};
use sqlx::PgPool;
use uuid::Uuid;
use webauthn_rs::{prelude::*, Webauthn};
use webauthn_rs_proto::{
    CreationChallengeResponse, RegisterPublicKeyCredential, RequestChallengeResponse,
    AuthenticationResponse,
};

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
                let invite_code = request.invite_code
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

        // Generate a temporary user ID for the challenge
        let temp_user_id = Uuid::new_v4();
        let user_unique_id = temp_user_id.to_string();
        
        // Start WebAuthn registration
        let (ccr, reg_state) = self.webauthn.start_passkey_registration(
            Uuid::parse_str(&user_unique_id)?,
            &request.display_name,
            &request.display_name,
            None,
        )?;

        // Store challenge in database
        let challenge_id = Uuid::new_v4().to_string();
        let challenge_data = serde_json::to_string(&reg_state)?;
        
        WebAuthnChallenge::create(
            pool,
            challenge_id.clone(),
            Some(temp_user_id),
            challenge_data,
            ChallengeType::Registration,
            Some(request.display_name),
            request.invite_code,
        ).await?;

        Ok(RegisterBeginResponse {
            challenge_id,
            options: ccr,
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

        // Deserialize the registration state
        let reg_state: PasskeyRegistration = serde_json::from_str(&challenge.challenge_data)?;

        // Finish WebAuthn registration
        let passkey = self.webauthn.finish_passkey_registration(&request.credential, &reg_state)?;

        // Validate invite again if needed (double-check)
        if let Some(invite_code) = &challenge.invite_code {
            let invitation = Invitation::find_by_code(pool, invite_code).await?
                .ok_or_else(|| anyhow!("Invite code no longer valid"))?;
            
            if !invitation.is_valid() {
                return Err(anyhow!("Invite code expired or exhausted"));
            }

            // Use the invitation
            Invitation::use_invitation(pool, invite_code, challenge.user_id.unwrap()).await?;
        }

        // Create user account
        let display_name = challenge.display_name.unwrap_or_else(|| "Unknown User".to_string());
        let create_user_request = CreateUserRequest {
            display_name: display_name.clone(),
            instance_fqdn: self.instance_fqdn.clone(),
        };

        let user_response = User::create(pool, create_user_request).await?;
        let user = user_response.user;

        // Store the credential
        UserCredential::create(
            pool,
            user.id,
            passkey.cred_id().clone(),
            passkey.cred().clone(),
            passkey.counter() as i64,
            Some(format!("{}'s Passkey", display_name)),
        ).await?;

        // Clean up challenge
        WebAuthnChallenge::delete(pool, &request.challenge_id).await?;

        tracing::info!("Successfully registered user {} with passkey", user.username);

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
        // For passkey authentication, we don't need to specify user credentials upfront
        // The authenticator will present available credentials
        let (rcr, auth_state) = self.webauthn.start_passkey_authentication(&[])?;

        // Store challenge in database
        let challenge_id = Uuid::new_v4().to_string();
        let challenge_data = serde_json::to_string(&auth_state)?;
        
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
            options: rcr,
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

        // Deserialize the authentication state
        let auth_state: PasskeyAuthentication = serde_json::from_str(&challenge.challenge_data)?;

        // Get the credential ID from the response
        let cred_id = request.credential.id.as_bytes();
        
        // Find the stored credential
        let stored_credential = UserCredential::find_by_credential_id(pool, cred_id).await?
            .ok_or_else(|| anyhow!("Credential not found"))?;

        // Convert stored credential to webauthn-rs format
        let passkey = Passkey::new(
            stored_credential.credential_id.clone(),
            stored_credential.public_key.clone(),
            stored_credential.counter as u32,
        );

        // Finish WebAuthn authentication
        let auth_result = self.webauthn.finish_passkey_authentication(&request.credential, &auth_state)?;

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

        tracing::info!("Successfully authenticated user {}", user.username);

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