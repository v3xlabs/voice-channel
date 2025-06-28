use base64::{engine::general_purpose, Engine as _};
use chrono::{DateTime, Utc};
use poem_openapi::Object;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;
use webauthn_rs::{prelude::*, Webauthn};
use webauthn_rs_proto::{PublicKeyCredentialCreationOptions, PublicKeyCredentialRequestOptions};

use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, Object)]
pub struct UserCredential {
    pub credential_record_id: Uuid,
    pub user_id: Uuid,
    pub credential_id: String,
    pub public_key: Vec<u8>,
    pub counter: i64,
    pub name: Option<String>,
    pub created_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, Object)]
pub struct WebauthnChallenge {
    pub challenge_record_id: Uuid,
    pub challenge_id: String,
    pub user_id: Option<Uuid>,
    pub challenge_data: String,
    pub challenge_type: String,
    pub display_name: Option<String>,
    pub invite_code: Option<String>,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Object)]
pub struct RegisterBeginRequest {
    pub display_name: String,
    pub invite_code: Option<String>,
}

#[derive(Debug, Serialize, Object)]
pub struct RegisterBeginResponse {
    pub challenge_id: String,
    pub options: serde_json::Value,
}

#[derive(Debug, Deserialize, Object)]
pub struct RegisterFinishRequest {
    pub challenge_id: String,
    pub credential: serde_json::Value,
}

#[derive(Debug, Serialize, Object)]
pub struct RegisterFinishResponse {
    pub user_id: Uuid,
    pub success: bool,
}

#[derive(Debug, Deserialize, Object)]
pub struct LoginBeginRequest {
    // Resident keys only - no username needed
}

#[derive(Debug, Serialize, Object)]
pub struct LoginBeginResponse {
    pub challenge_id: String,
    pub options: serde_json::Value,
}

#[derive(Debug, Deserialize, Object)]
pub struct LoginFinishRequest {
    pub challenge_id: String,
    pub credential: serde_json::Value,
}

#[derive(Debug, Serialize, Object)]
pub struct LoginFinishResponse {
    pub user_id: Uuid,
    pub username: String,
    pub success: bool,
}

#[derive(Debug, Serialize, Object)]
pub struct CredentialInfo {
    pub credential_record_id: Uuid,
    pub name: Option<String>,
    pub created_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
}

impl UserCredential {
    /// Store a new credential
    pub async fn store_credential(
        pool: &PgPool,
        user_id: Uuid,
        credential_id: &str,
        public_key: &[u8],
        counter: u32,
        name: Option<String>,
    ) -> Result<Self, AppError> {
        let credential = sqlx::query!(
            r#"
            INSERT INTO user_credentials (user_id, credential_id, public_key, counter, name)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING credential_record_id, user_id, credential_id, public_key, counter, name, created_at, last_used_at
            "#,
            user_id,
            credential_id,
            public_key,
            counter as i64,
            name
        )
        .fetch_one(pool)
        .await?;

        // Update user has_passkey flag
        sqlx::query!(
            "UPDATE users SET has_passkey = true WHERE user_id = $1",
            user_id
        )
        .execute(pool)
        .await?;

        Ok(UserCredential {
            credential_record_id: credential.credential_record_id,
            user_id: credential.user_id,
            credential_id: credential.credential_id,
            public_key: credential.public_key,
            counter: credential.counter,
            name: credential.name,
            created_at: credential.created_at,
            last_used_at: credential.last_used_at,
        })
    }

    /// Get credentials for a user
    pub async fn get_for_user(pool: &PgPool, user_id: Uuid) -> Result<Vec<Self>, AppError> {
        let credentials = sqlx::query!(
            r#"
            SELECT credential_record_id, user_id, credential_id, public_key, counter, name, created_at, last_used_at
            FROM user_credentials
            WHERE user_id = $1
            ORDER BY created_at DESC
            "#,
            user_id
        )
        .fetch_all(pool)
        .await?;

        let result = credentials
            .into_iter()
            .map(|row| UserCredential {
                credential_record_id: row.credential_record_id,
                user_id: row.user_id,
                credential_id: row.credential_id,
                public_key: row.public_key,
                counter: row.counter,
                name: row.name,
                created_at: row.created_at,
                last_used_at: row.last_used_at,
            })
            .collect();

        Ok(result)
    }

    /// Get credential by credential_id
    pub async fn get_by_credential_id(pool: &PgPool, credential_id: &str) -> Result<Option<Self>, AppError> {
        let credential = sqlx::query!(
            r#"
            SELECT credential_record_id, user_id, credential_id, public_key, counter, name, created_at, last_used_at
            FROM user_credentials
            WHERE credential_id = $1
            "#,
            credential_id
        )
        .fetch_optional(pool)
        .await?;

        if let Some(row) = credential {
            Ok(Some(UserCredential {
                credential_record_id: row.credential_record_id,
                user_id: row.user_id,
                credential_id: row.credential_id,
                public_key: row.public_key,
                counter: row.counter,
                name: row.name,
                created_at: row.created_at,
                last_used_at: row.last_used_at,
            }))
        } else {
            Ok(None)
        }
    }

    /// Update credential counter
    pub async fn update_counter(
        pool: &PgPool,
        credential_id: &str,
        counter: u32,
    ) -> Result<(), AppError> {
        sqlx::query!(
            r#"
            UPDATE user_credentials 
            SET counter = $1, last_used_at = NOW()
            WHERE credential_id = $2
            "#,
            counter as i64,
            credential_id
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Delete a credential
    pub async fn delete_credential(
        pool: &PgPool,
        credential_record_id: Uuid,
        user_id: Uuid,
    ) -> Result<bool, AppError> {
        let result = sqlx::query!(
            "DELETE FROM user_credentials WHERE credential_record_id = $1 AND user_id = $2",
            credential_record_id,
            user_id
        )
        .execute(pool)
        .await?;

        // Check if user has any remaining credentials
        let remaining_count = sqlx::query_scalar!(
            "SELECT COUNT(*) FROM user_credentials WHERE user_id = $1",
            user_id
        )
        .fetch_one(pool)
        .await?;

        if remaining_count.unwrap_or(0) == 0 {
            sqlx::query!(
                "UPDATE users SET has_passkey = false WHERE user_id = $1",
                user_id
            )
            .execute(pool)
            .await?;
        }

        Ok(result.rows_affected() > 0)
    }
}

impl WebauthnChallenge {
    /// Store a new challenge
    pub async fn store_challenge(
        pool: &PgPool,
        challenge_id: String,
        user_id: Option<Uuid>,
        challenge_data: String,
        challenge_type: String,
        display_name: Option<String>,
        invite_code: Option<String>,
    ) -> Result<Self, AppError> {
        let challenge = sqlx::query!(
            r#"
            INSERT INTO webauthn_challenges 
            (challenge_id, user_id, challenge_data, challenge_type, display_name, invite_code)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING challenge_record_id, challenge_id, user_id, challenge_data, challenge_type, 
                      expires_at, created_at, display_name, invite_code
            "#,
            challenge_id,
            user_id,
            challenge_data,
            challenge_type,
            display_name,
            invite_code
        )
        .fetch_one(pool)
        .await?;

        Ok(WebauthnChallenge {
            challenge_record_id: challenge.challenge_record_id,
            challenge_id: challenge.challenge_id,
            user_id: challenge.user_id,
            challenge_data: challenge.challenge_data,
            challenge_type: challenge.challenge_type,
            display_name: challenge.display_name,
            invite_code: challenge.invite_code,
            expires_at: challenge.expires_at,
            created_at: challenge.created_at,
        })
    }

    /// Get challenge by challenge_id
    pub async fn get_by_challenge_id(pool: &PgPool, challenge_id: &str) -> Result<Option<Self>, AppError> {
        let challenge = sqlx::query!(
            r#"
            SELECT challenge_record_id, challenge_id, user_id, challenge_data, challenge_type, 
                   expires_at, created_at, display_name, invite_code
            FROM webauthn_challenges 
            WHERE challenge_id = $1
            "#,
            challenge_id
        )
        .fetch_optional(pool)
        .await?;

        if let Some(row) = challenge {
            Ok(Some(WebauthnChallenge {
                challenge_record_id: row.challenge_record_id,
                challenge_id: row.challenge_id,
                user_id: row.user_id,
                challenge_data: row.challenge_data,
                challenge_type: row.challenge_type,
                display_name: row.display_name,
                invite_code: row.invite_code,
                expires_at: row.expires_at,
                created_at: row.created_at,
            }))
        } else {
            Ok(None)
        }
    }

    /// Delete challenge
    pub async fn delete_challenge(pool: &PgPool, challenge_id: &str) -> Result<(), AppError> {
        sqlx::query!(
            "DELETE FROM webauthn_challenges WHERE challenge_id = $1",
            challenge_id
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Clean up expired challenges
    pub async fn cleanup_expired(pool: &PgPool) -> Result<u64, AppError> {
        let result = sqlx::query!("DELETE FROM webauthn_challenges WHERE expires_at < NOW()")
            .execute(pool)
            .await?;

        Ok(result.rows_affected())
    }
} 