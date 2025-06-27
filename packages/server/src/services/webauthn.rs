use anyhow::{anyhow, Result};
use sqlx::PgPool;
use uuid::Uuid;
use webauthn_rs::{prelude::*, Webauthn};
use webauthn_rs_proto::ResidentKeyRequirement;
use std::collections::HashMap;
use tokio::sync::RwLock;

use crate::models::{
    webauthn::{
        WebAuthnChallenge, ChallengeType, UserCredential,
        RegisterBeginRequest, RegisterBeginResponse,
        RegisterFinishRequest, RegisterFinishResponse,
        LoginBeginRequest, LoginBeginResponse,
        LoginFinishRequest, LoginFinishResponse,
    },
    user::{User, CreateUserRequest},
    invitation::Invitation,
    instance_settings::InstanceSettings,
};

pub struct WebAuthnService {
    webauthn: Webauthn,
    instance_fqdn: String,
    // In-memory challenge storage - in production use Redis or persistent storage
    registration_challenges: RwLock<HashMap<String, PasskeyRegistration>>,
    authentication_challenges: RwLock<HashMap<String, PasskeyAuthentication>>,
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
            registration_challenges: RwLock::new(HashMap::new()),
            authentication_challenges: RwLock::new(HashMap::new()),
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

        // Store challenge in database and in-memory state
        let challenge_id = Uuid::new_v4().to_string();
        
        // Store the WebAuthn state in memory
        self.registration_challenges.write().await.insert(challenge_id.clone(), reg_state);
        
        // Store challenge metadata in database
        WebAuthnChallenge::create(
            pool,
            challenge_id.clone(),
            None, // No user_id during registration
            "registration_state".to_string(), // Placeholder - actual state is in memory
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

        // Get registration state from memory
        let reg_state = self.registration_challenges.write().await
            .remove(&request.challenge_id)
            .ok_or_else(|| anyhow!("Registration challenge not found or expired"))?;
        
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

        // Store the verified credential
        let credential_id = passkey.cred_id().to_vec();
        // Store the passkey as JSON for future authentication
        let public_key = serde_json::to_vec(&passkey)
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
        // For resident key authentication, get all stored passkeys to enable authentication
        // In a real discoverable auth flow, we need to provide the stored credentials
        let all_credentials = sqlx::query!(
            "SELECT credential_id, public_key FROM user_credentials"
        )
        .fetch_all(pool)
        .await?;

        // Deserialize all stored passkeys
        let mut stored_passkeys = Vec::new();
        for cred_row in all_credentials {
            if let Ok(passkey) = serde_json::from_slice::<Passkey>(&cred_row.public_key) {
                stored_passkeys.push(passkey);
            }
        }

        // Start passkey authentication with the stored credentials
        let (rcr, auth_state) = self.webauthn.start_passkey_authentication(&stored_passkeys)?;

        // Store challenge in database and in-memory state
        let challenge_id = Uuid::new_v4().to_string();
        
        // Store the WebAuthn state in memory
        self.authentication_challenges.write().await.insert(challenge_id.clone(), auth_state);
        
        // Store challenge metadata in database
        WebAuthnChallenge::create(
            pool,
            challenge_id.clone(),
            None, // No user ID yet
            "authentication_state".to_string(), // Placeholder - actual state is in memory
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

        // Get authentication state from memory
        let auth_state = self.authentication_challenges.write().await
            .remove(&request.challenge_id)
            .ok_or_else(|| anyhow!("Authentication challenge not found or expired"))?;

        // Parse the authentication credential from frontend
        let auth_pk_credential: PublicKeyCredential = serde_json::from_value(request.credential)
            .map_err(|e| anyhow!("Invalid authentication credential format: {}", e))?;

        // Verify the authentication using webauthn-rs - this should work now since we provided the credentials during start
        let auth_result = self.webauthn.finish_passkey_authentication(&auth_pk_credential, &auth_state)
            .map_err(|e| anyhow!("Authentication verification failed: {:?}", e))?;

        // Extract credential ID to find the specific stored credential for counter update
        let credential_id = auth_pk_credential.raw_id.as_ref();
        let stored_credential = UserCredential::find_by_credential_id(pool, credential_id).await?
            .ok_or_else(|| anyhow!("Credential not found in database"))?;

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
        // Clean up database challenges
        let deleted_count = WebAuthnChallenge::cleanup_expired(pool).await?;
        
        // TODO: Also clean up in-memory challenges based on timestamp
        // For now, they'll be cleaned up when the service restarts
        
        Ok(deleted_count)
    }
} 