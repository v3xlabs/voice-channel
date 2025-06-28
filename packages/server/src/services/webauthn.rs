use anyhow::{anyhow, Result};
use sqlx::PgPool;
use uuid::Uuid;
use webauthn_rs::{prelude::*, Webauthn};
use std::collections::HashMap;
use tokio::sync::RwLock;
use base64::{engine::general_purpose, Engine as _};
use crate::models::{
    webauthn::{
        RegisterBeginRequest, RegisterBeginResponse,
        RegisterFinishRequest, RegisterFinishResponse,
        LoginBeginRequest, LoginBeginResponse,
        LoginFinishRequest, LoginFinishResponse,
        WebauthnChallenge,
    },
    user::{User, CreateUserRequest},
};

pub struct WebAuthnService {
    webauthn: Webauthn,
    instance_fqdn: String,
    origin: String,
    rp_id: String,
    // Store registration sessions in memory (in production, use Redis or similar)
    registration_sessions: RwLock<HashMap<String, (PasskeyRegistration, String, Option<String>)>>,
    authentication_sessions: RwLock<HashMap<String, DiscoverableAuthentication>>,
}

impl WebAuthnService {
    pub fn new(origin: &str, rp_id: &str, instance_fqdn: String) -> Result<Self> {
        let rp_origin = Url::parse(origin)
            .map_err(|e| anyhow!("Invalid WebAuthn origin '{}': {}", origin, e))?;
        
        let builder = WebauthnBuilder::new(rp_id, &rp_origin)
            .map_err(|e| anyhow!("Failed to create WebAuthn builder: {}", e))?;
        
        let webauthn = builder
            .rp_name(rp_id)
            .build()
            .map_err(|e| anyhow!("Failed to build WebAuthn service: {}", e))?;

        tracing::info!(
            "WebAuthn service initialized: origin={}, rp_id={}, instance_fqdn={}",
            origin, rp_id, instance_fqdn
        );

        Ok(Self {
            webauthn,
            instance_fqdn,
            origin: origin.to_string(),
            rp_id: rp_id.to_string(),
            registration_sessions: RwLock::new(HashMap::new()),
            authentication_sessions: RwLock::new(HashMap::new()),
        })
    }

    pub async fn register_begin(
        &self,
        _pool: &PgPool,
        request: RegisterBeginRequest,
    ) -> Result<RegisterBeginResponse> {
        // Validate display name
        if request.display_name.trim().is_empty() {
            return Err(anyhow!("Display name cannot be empty"));
        }

        if request.display_name.len() > 100 {
            return Err(anyhow!("Display name too long (max 100 characters)"));
        }

        // Generate a unique user ID for this registration attempt
        let user_id = Uuid::new_v4();
        
        tracing::info!(
            "Starting WebAuthn registration for display_name='{}', user_id={}",
            request.display_name, user_id
        );
        
        // Start RESIDENT KEY registration (as requested by user)
        let (ccr, passkey_registration) = self.webauthn.start_passkey_registration(
            user_id,
            &request.display_name,
            &request.display_name,
            None,
        )?;

        // Store the session in memory
        let challenge_id = Uuid::new_v4().to_string();
        self.registration_sessions.write().await.insert(
            challenge_id.clone(),
            (passkey_registration, request.display_name.clone(), request.invite_code.clone()),
        );

        tracing::debug!("WebAuthn registration challenge created: {}", challenge_id);

        Ok(RegisterBeginResponse {
            challenge_id,
            options: serde_json::to_value(ccr)?,
        })
    }

    pub async fn register_finish(
        &self,
        pool: &PgPool,
        request: RegisterFinishRequest,
    ) -> Result<RegisterFinishResponse> {
        tracing::info!("Finishing WebAuthn registration for challenge: {}", request.challenge_id);

        // Get the registration session
        let (passkey_registration, display_name, invite_code) = self
            .registration_sessions
            .write()
            .await
            .remove(&request.challenge_id)
            .ok_or_else(|| anyhow!("Registration session not found or expired"))?;
        
        // Parse the credential from the client
        let reg: RegisterPublicKeyCredential = serde_json::from_value(request.credential)
            .map_err(|e| anyhow!("Invalid credential format: {}", e))?;

        // Finish the registration with WebAuthn
        let passkey = self.webauthn.finish_passkey_registration(&reg, &passkey_registration)
            .map_err(|e| anyhow!("WebAuthn registration failed: {}", e))?;

        // TODO: Validate invite code if provided
        if let Some(code) = &invite_code {
            tracing::info!("Registration using invite code: {}", code);
            // Here you would validate the invite code against the database
            // For now, we'll just log it
        }

        // Create the user
        let create_user_request = CreateUserRequest {
            username: display_name.trim().to_string(),
        };
        
        let user_auth = User::create(pool, create_user_request, self.instance_fqdn.clone()).await
            .map_err(|e| anyhow!("Failed to create user: {}", e))?;

        // Store the credential - convert credential ID to base64 string
        let credential_id = general_purpose::STANDARD.encode(passkey.cred_id());
        let public_key_bytes = bincode::serialize(&passkey)
            .map_err(|e| anyhow!("Failed to serialize passkey: {}", e))?;

        crate::models::webauthn::UserCredential::store_credential(
            pool,
            user_auth.user.user_id,
            &credential_id,
            &public_key_bytes,
            0, // Start with counter 0 for new passkeys
            Some("Primary Passkey".to_string()),
        ).await
        .map_err(|e| anyhow!("Failed to store credential: {}", e))?;

        tracing::info!(
            "WebAuthn registration completed successfully for user: {} ({})",
            user_auth.user.username, user_auth.user.user_id
        );

        Ok(RegisterFinishResponse {
            user_id: user_auth.user.user_id,
            success: true,
        })
    }

    pub async fn login_begin(
        &self,
        _pool: &PgPool,
        _request: LoginBeginRequest,
    ) -> Result<LoginBeginResponse> {
        tracing::info!("Starting WebAuthn discoverable authentication");

        // For RESIDENT KEY authentication (discoverable credentials), we don't need to specify which user
        // This enables the frontend to use credential.get() without userVerification
        let (rcr, discoverable_authentication) = self.webauthn.start_discoverable_authentication()
            .map_err(|e| anyhow!("Failed to start discoverable authentication: {}", e))?;

        // Store the session in memory
        let challenge_id = Uuid::new_v4().to_string();
        self.authentication_sessions.write().await.insert(
            challenge_id.clone(),
            discoverable_authentication,
        );

        tracing::debug!("WebAuthn login challenge created: {}", challenge_id);

        Ok(LoginBeginResponse {
            challenge_id,
            options: serde_json::to_value(rcr)?,
        })
    }

    pub async fn login_finish(
        &self,
        pool: &PgPool,
        request: LoginFinishRequest,
    ) -> Result<LoginFinishResponse> {
        tracing::info!("Finishing WebAuthn authentication for challenge: {}", request.challenge_id);

        // Get the authentication session
        let discoverable_authentication = self
            .authentication_sessions
            .write()
            .await
            .remove(&request.challenge_id)
            .ok_or_else(|| anyhow!("Authentication session not found or expired"))?;
        
        // Parse the credential from the client
        let auth: PublicKeyCredential = serde_json::from_value(request.credential)
            .map_err(|e| anyhow!("Invalid credential format: {}", e))?;

        // Get the credential ID from the assertion - convert to base64 string
        let cred_id = general_purpose::STANDARD.encode(&auth.raw_id);
        
        tracing::debug!("Looking up credential: {}", cred_id);

        // Find the user credential
        let user_credential = crate::models::webauthn::UserCredential::get_by_credential_id(pool, &cred_id)
            .await
            .map_err(|e| anyhow!("Database error while looking up credential: {}", e))?
            .ok_or_else(|| anyhow!("Credential not found or not registered"))?;

        // Deserialize the stored passkey
        let passkey: Passkey = bincode::deserialize(&user_credential.public_key)
            .map_err(|e| anyhow!("Failed to deserialize stored passkey: {}", e))?;
        
        // Finish authentication using the correct method with passkey vector
        let auth_result = self.webauthn.finish_discoverable_authentication(
            &auth, 
            discoverable_authentication, 
            &[passkey.clone().into()]
        ).map_err(|e| anyhow!("WebAuthn authentication failed: {}", e))?;

        // Update the credential counter using the new counter from auth result
        crate::models::webauthn::UserCredential::update_counter(
            pool,
            &cred_id,
            auth_result.counter(),
        ).await
        .map_err(|e| anyhow!("Failed to update credential counter: {}", e))?;

        // Get the user
        let user = User::find_by_id(pool, user_credential.user_id)
            .await
            .map_err(|e| anyhow!("Database error while looking up user: {}", e))?
            .ok_or_else(|| anyhow!("User not found for credential"))?;

        tracing::info!(
            "WebAuthn authentication completed successfully for user: {} ({})",
            user.username, user.user_id
        );

        Ok(LoginFinishResponse {
            user_id: user.user_id,
            username: user.username,
            success: true,
        })
    }

    pub async fn get_user_credentials(
        &self,
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Vec<crate::models::webauthn::CredentialInfo>> {
        let credentials = crate::models::webauthn::UserCredential::get_for_user(pool, user_id).await?;
        
        let result = credentials
            .into_iter()
            .map(|cred| crate::models::webauthn::CredentialInfo {
                credential_record_id: cred.credential_record_id,
                name: cred.name,
                created_at: cred.created_at,
                last_used_at: cred.last_used_at,
            })
            .collect();

        Ok(result)
    }

    pub async fn delete_user_credential(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        credential_id: Uuid,
    ) -> Result<bool> {
        let success = crate::models::webauthn::UserCredential::delete_credential(
            pool,
            credential_id,
            user_id,
        ).await?;

        Ok(success)
    }

    pub async fn cleanup_expired_challenges(&self, _pool: &PgPool) -> Result<u64> {
        // Clean up expired sessions (older than 5 minutes)
        let cleaned_count = 0;
        
        // For now just return 0, in production this would clean up expired sessions
        // based on timestamps
        
        Ok(cleaned_count)
    }

    /// Get WebAuthn configuration info
    pub fn get_config_info(&self) -> (String, String, String) {
        (self.origin.clone(), self.rp_id.clone(), self.instance_fqdn.clone())
    }

    /// Validate that the WebAuthn service is properly configured
    pub fn validate_config(&self) -> Result<()> {
        // Check that origin is a valid URL
        if Url::parse(&self.origin).is_err() {
            return Err(anyhow!("Invalid WebAuthn origin: {}", self.origin));
        }

        // Check that rp_id is not empty
        if self.rp_id.is_empty() {
            return Err(anyhow!("WebAuthn RP ID cannot be empty"));
        }

        // Check that instance_fqdn is not empty
        if self.instance_fqdn.is_empty() {
            return Err(anyhow!("Instance FQDN cannot be empty"));
        }

        // For localhost development, ensure consistency
        if self.rp_id == "localhost" && !self.origin.starts_with("http://localhost") {
            return Err(anyhow!(
                "Inconsistent WebAuthn config: rp_id is 'localhost' but origin is '{}'",
                self.origin
            ));
        }

        // For production, ensure HTTPS
        if self.rp_id != "localhost" && !self.origin.starts_with("https://") {
            tracing::warn!(
                "WebAuthn origin '{}' is not HTTPS in production environment",
                self.origin
            );
        }

        Ok(())
    }

    /// Clean up expired in-memory sessions (call this periodically)
    pub async fn cleanup_expired_sessions(&self) -> Result<u64> {
        // In a real implementation, we'd track timestamps and clean up expired sessions
        // For now, just return 0 since we're using simple in-memory storage
        let cleaned_count = 0;
        
        tracing::debug!("Cleaned up {} expired WebAuthn sessions", cleaned_count);
        Ok(cleaned_count)
    }
} 