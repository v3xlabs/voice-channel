use chrono::{DateTime, Utc};
use poem_openapi::Object;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;
use anyhow::Result;
use webauthn_rs_proto::{
    CreationChallengeResponse, RegisterPublicKeyCredential, RequestChallengeResponse,
    AuthenticationResponse, AuthenticatorAttachment,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserCredential {
    pub id: Uuid,
    pub user_id: Uuid,
    pub credential_id: Vec<u8>,
    pub public_key: Vec<u8>,
    pub counter: i64,
    pub name: Option<String>,
    pub created_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebAuthnChallenge {
    pub id: Uuid,
    pub challenge_id: String,
    pub user_id: Option<Uuid>,
    pub challenge_data: String,
    pub challenge_type: ChallengeType,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub display_name: Option<String>,
    pub invite_code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ChallengeType {
    Registration,
    Authentication,
}

impl std::fmt::Display for ChallengeType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ChallengeType::Registration => write!(f, "registration"),
            ChallengeType::Authentication => write!(f, "authentication"),
        }
    }
}

impl std::str::FromStr for ChallengeType {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "registration" => Ok(ChallengeType::Registration),
            "authentication" => Ok(ChallengeType::Authentication),
            _ => Err(anyhow::anyhow!("Invalid challenge type: {}", s)),
        }
    }
}

// API Request/Response types
#[derive(Debug, Deserialize, Object)]
pub struct RegisterBeginRequest {
    pub display_name: String,
    pub invite_code: Option<String>,
}

#[derive(Debug, Serialize, Object)]
pub struct RegisterBeginResponse {
    pub challenge_id: String,
    pub options: CreationChallengeResponse,
}

#[derive(Debug, Deserialize, Object)]
pub struct RegisterFinishRequest {
    pub challenge_id: String,
    pub credential: RegisterPublicKeyCredential,
}

#[derive(Debug, Serialize, Object)]
pub struct RegisterFinishResponse {
    pub user: crate::models::user::User,
    pub is_new: bool,
}

#[derive(Debug, Deserialize, Object)]
pub struct LoginBeginRequest {
    pub username: Option<String>, // Optional username hint
}

#[derive(Debug, Serialize, Object)]
pub struct LoginBeginResponse {
    pub challenge_id: String,
    pub options: RequestChallengeResponse,
}

#[derive(Debug, Deserialize, Object)]
pub struct LoginFinishRequest {
    pub challenge_id: String,
    pub credential: AuthenticationResponse,
}

#[derive(Debug, Serialize, Object)]
pub struct LoginFinishResponse {
    pub user: crate::models::user::User,
}

#[derive(Debug, Serialize, Object)]
pub struct CredentialInfo {
    pub id: String,
    pub name: Option<String>,
    pub created_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
}

impl UserCredential {
    /// Create a new credential
    pub async fn create(
        pool: &PgPool,
        user_id: Uuid,
        credential_id: Vec<u8>,
        public_key: Vec<u8>,
        counter: i64,
        name: Option<String>,
    ) -> Result<Self> {
        let credential = sqlx::query!(
            r#"
            INSERT INTO user_credentials (user_id, credential_id, public_key, counter, name)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, user_id, credential_id, public_key, counter, name, created_at, last_used_at
            "#,
            user_id,
            credential_id,
            public_key,
            counter,
            name
        )
        .fetch_one(pool)
        .await?;

        // Update user's has_passkey flag
        sqlx::query!(
            "UPDATE users SET has_passkey = true WHERE id = $1",
            user_id
        )
        .execute(pool)
        .await?;

        Ok(UserCredential {
            id: credential.id,
            user_id: credential.user_id,
            credential_id: credential.credential_id,
            public_key: credential.public_key,
            counter: credential.counter,
            name: credential.name,
            created_at: credential.created_at,
            last_used_at: credential.last_used_at,
        })
    }

    /// Find credentials by user ID
    pub async fn find_by_user_id(pool: &PgPool, user_id: Uuid) -> Result<Vec<Self>> {
        let credentials = sqlx::query!(
            r#"
            SELECT id, user_id, credential_id, public_key, counter, name, created_at, last_used_at
            FROM user_credentials
            WHERE user_id = $1
            ORDER BY created_at DESC
            "#,
            user_id
        )
        .fetch_all(pool)
        .await?;

        Ok(credentials.into_iter().map(|row| UserCredential {
            id: row.id,
            user_id: row.user_id,
            credential_id: row.credential_id,
            public_key: row.public_key,
            counter: row.counter,
            name: row.name,
            created_at: row.created_at,
            last_used_at: row.last_used_at,
        }).collect())
    }

    /// Find credential by credential ID
    pub async fn find_by_credential_id(pool: &PgPool, credential_id: &[u8]) -> Result<Option<Self>> {
        let credential = sqlx::query!(
            r#"
            SELECT id, user_id, credential_id, public_key, counter, name, created_at, last_used_at
            FROM user_credentials
            WHERE credential_id = $1
            "#,
            credential_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(credential.map(|row| UserCredential {
            id: row.id,
            user_id: row.user_id,
            credential_id: row.credential_id,
            public_key: row.public_key,
            counter: row.counter,
            name: row.name,
            created_at: row.created_at,
            last_used_at: row.last_used_at,
        }))
    }

    /// Update credential counter after successful authentication
    pub async fn update_counter(pool: &PgPool, credential_id: &[u8], new_counter: i64) -> Result<()> {
        sqlx::query!(
            r#"
            UPDATE user_credentials 
            SET counter = $1, last_used_at = NOW()
            WHERE credential_id = $2
            "#,
            new_counter,
            credential_id
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Delete a credential
    pub async fn delete(pool: &PgPool, credential_id: Uuid, user_id: Uuid) -> Result<bool> {
        let result = sqlx::query!(
            "DELETE FROM user_credentials WHERE id = $1 AND user_id = $2",
            credential_id,
            user_id
        )
        .execute(pool)
        .await?;

        // Update user's has_passkey flag if no more credentials
        let remaining_count = sqlx::query_scalar!(
            "SELECT COUNT(*) FROM user_credentials WHERE user_id = $1",
            user_id
        )
        .fetch_one(pool)
        .await?;

        if remaining_count.unwrap_or(0) == 0 {
            sqlx::query!(
                "UPDATE users SET has_passkey = false WHERE id = $1",
                user_id
            )
            .execute(pool)
            .await?;
        }

        Ok(result.rows_affected() > 0)
    }
}

impl WebAuthnChallenge {
    /// Create a new challenge
    pub async fn create(
        pool: &PgPool,
        challenge_id: String,
        user_id: Option<Uuid>,
        challenge_data: String,
        challenge_type: ChallengeType,
        display_name: Option<String>,
        invite_code: Option<String>,
    ) -> Result<Self> {
        let challenge = sqlx::query!(
            r#"
            INSERT INTO webauthn_challenges 
            (challenge_id, user_id, challenge_data, challenge_type, display_name, invite_code)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, challenge_id, user_id, challenge_data, challenge_type, 
                      expires_at, created_at, display_name, invite_code
            "#,
            challenge_id,
            user_id,
            challenge_data,
            challenge_type.to_string(),
            display_name,
            invite_code
        )
        .fetch_one(pool)
        .await?;

        Ok(WebAuthnChallenge {
            id: challenge.id,
            challenge_id: challenge.challenge_id,
            user_id: challenge.user_id,
            challenge_data: challenge.challenge_data,
            challenge_type: challenge.challenge_type.parse()?,
            expires_at: challenge.expires_at,
            created_at: challenge.created_at,
            display_name: challenge.display_name,
            invite_code: challenge.invite_code,
        })
    }

    /// Find challenge by challenge ID
    pub async fn find_by_challenge_id(pool: &PgPool, challenge_id: &str) -> Result<Option<Self>> {
        let challenge = sqlx::query!(
            r#"
            SELECT id, challenge_id, user_id, challenge_data, challenge_type, 
                   expires_at, created_at, display_name, invite_code
            FROM webauthn_challenges
            WHERE challenge_id = $1 AND expires_at > NOW()
            "#,
            challenge_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(challenge.map(|row| -> Result<WebAuthnChallenge> {
            Ok(WebAuthnChallenge {
                id: row.id,
                challenge_id: row.challenge_id,
                user_id: row.user_id,
                challenge_data: row.challenge_data,
                challenge_type: row.challenge_type.parse()?,
                expires_at: row.expires_at,
                created_at: row.created_at,
                display_name: row.display_name,
                invite_code: row.invite_code,
            })
        }).transpose()?)
    }

    /// Delete a challenge after use
    pub async fn delete(pool: &PgPool, challenge_id: &str) -> Result<()> {
        sqlx::query!(
            "DELETE FROM webauthn_challenges WHERE challenge_id = $1",
            challenge_id
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Clean up expired challenges
    pub async fn cleanup_expired(pool: &PgPool) -> Result<u64> {
        let result = sqlx::query!("DELETE FROM webauthn_challenges WHERE expires_at < NOW()")
            .execute(pool)
            .await?;

        Ok(result.rows_affected())
    }
} 