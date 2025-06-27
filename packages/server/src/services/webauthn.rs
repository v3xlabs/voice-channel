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
    // Store registration sessions in memory (in production, use Redis or similar)
    registration_sessions: RwLock<HashMap<String, (PasskeyRegistration, String, Option<String>)>>,
    authentication_sessions: RwLock<HashMap<String, DiscoverableAuthentication>>,
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
            registration_sessions: RwLock::new(HashMap::new()),
            authentication_sessions: RwLock::new(HashMap::new()),
        })
    }

    pub async fn register_begin(
        &self,
        _pool: &PgPool,
        request: RegisterBeginRequest,
    ) -> Result<RegisterBeginResponse> {
        // Generate a unique user ID for this registration attempt
        let user_id = Uuid::new_v4();
        
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
        // Get the registration session
        let (passkey_registration, display_name, _invite_code) = self
            .registration_sessions
            .write()
            .await
            .remove(&request.challenge_id)
            .ok_or_else(|| anyhow::anyhow!("Registration session not found or expired"))?;
        
        // Parse the credential from the client
        let reg: RegisterPublicKeyCredential = serde_json::from_value(request.credential)?;

        // Finish the registration
        let passkey = self.webauthn.finish_passkey_registration(&reg, &passkey_registration)?;

        // Create the user
        let create_user_request = CreateUserRequest {
            username: display_name,
        };
        
        let user_auth = User::create(pool, create_user_request, self.instance_fqdn.clone()).await?;

        // Store the credential - convert credential ID to base64 string
        let credential_id = general_purpose::STANDARD.encode(passkey.cred_id());
        let public_key_bytes = bincode::serialize(&passkey)?;

        crate::models::webauthn::UserCredential::store_credential(
            pool,
            user_auth.user.user_id,
            &credential_id,
            &public_key_bytes,
            0, // Start with counter 0 for new passkeys
            Some("Primary Passkey".to_string()),
        ).await?;

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
        // For RESIDENT KEY authentication (discoverable credentials), we don't need to specify which user
        // This enables the frontend to use credential.get() without userVerification
        let (rcr, discoverable_authentication) = self.webauthn.start_discoverable_authentication()?;

        // Store the session in memory
        let challenge_id = Uuid::new_v4().to_string();
        self.authentication_sessions.write().await.insert(
            challenge_id.clone(),
            discoverable_authentication,
        );

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
        // Get the authentication session
        let discoverable_authentication = self
            .authentication_sessions
            .write()
            .await
            .remove(&request.challenge_id)
            .ok_or_else(|| anyhow::anyhow!("Authentication session not found or expired"))?;
        
        // Parse the credential from the client
        let auth: PublicKeyCredential = serde_json::from_value(request.credential)?;

        // Get the credential ID from the assertion - convert to base64 string
        let cred_id = general_purpose::STANDARD.encode(&auth.raw_id);
        
        // Find the user credential
        let user_credential = crate::models::webauthn::UserCredential::get_by_credential_id(pool, &cred_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Credential not found"))?;

        // Deserialize the stored passkey
        let passkey: Passkey = bincode::deserialize(&user_credential.public_key)?;
        
        // Finish authentication using the correct method with passkey vector
        let auth_result = self.webauthn.finish_discoverable_authentication(&auth, discoverable_authentication, &[passkey.clone().into()])?;

        // Update the credential counter using the new counter from auth result
        crate::models::webauthn::UserCredential::update_counter(
            pool,
            &cred_id,
            auth_result.counter(),
        ).await?;

        // Get the user
        let user = User::find_by_id(pool, user_credential.user_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("User not found"))?;

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
} 