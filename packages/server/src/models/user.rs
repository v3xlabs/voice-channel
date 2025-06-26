use chrono::{DateTime, Utc};
use poem_openapi::Object;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;
use anyhow::Result;

#[derive(Debug, Clone, Serialize, Deserialize, Object)]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub display_name: String,
    pub instance_fqdn: String,
    pub passkey_id: Option<String>, // WebAuthn credential ID
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Object)]
pub struct CreateUserRequest {
    pub display_name: String,
    pub instance_fqdn: String,
    pub passkey_credential: Option<String>, // WebAuthn credential for passkey
}

#[derive(Debug, Deserialize, Object)]
pub struct UpdateUserRequest {
    pub display_name: Option<String>,
    pub passkey_credential: Option<String>,
}

#[derive(Debug, Serialize, Object)]
pub struct UserAuthResponse {
    pub user: User,
    pub is_new: bool,
    pub challenge: Option<String>, // WebAuthn challenge for registration
}

impl User {
    /// Generate a unique username based on display name
    fn generate_username(display_name: &str, instance_fqdn: &str) -> String {
        let base = display_name
            .chars()
            .filter(|c| c.is_alphanumeric())
            .collect::<String>()
            .to_lowercase();
        
        let base = if base.is_empty() { "user".to_string() } else { base };
        let timestamp = chrono::Utc::now().timestamp_millis();
        let short_instance = instance_fqdn.split('.').next().unwrap_or("local");
        
        format!("{}_{}", base, timestamp % 10000)
    }

    /// Create a new user account
    pub async fn create(pool: &PgPool, request: CreateUserRequest) -> Result<UserAuthResponse> {
        let username = Self::generate_username(&request.display_name, &request.instance_fqdn);
        
        let user = sqlx::query!(
            r#"
            INSERT INTO users (id, username, display_name, instance_fqdn, passkey_id)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, username, display_name, instance_fqdn, passkey_id, created_at, updated_at
            "#,
            Uuid::new_v4(),
            username,
            request.display_name,
            request.instance_fqdn,
            request.passkey_credential
        )
        .fetch_one(pool)
        .await?;

        let user = User {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            instance_fqdn: user.instance_fqdn,
            passkey_id: user.passkey_id,
            created_at: user.created_at,
            updated_at: user.updated_at,
        };

        Ok(UserAuthResponse {
            user,
            is_new: true,
            challenge: None,
        })
    }

    /// Find user by passkey credential ID
    pub async fn find_by_passkey(pool: &PgPool, passkey_id: &str) -> Result<Option<User>> {
        let user = sqlx::query!(
            "SELECT id, username, display_name, instance_fqdn, passkey_id, created_at, updated_at FROM users WHERE passkey_id = $1",
            passkey_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(user.map(|row| User {
            id: row.id,
            username: row.username,
            display_name: row.display_name,
            instance_fqdn: row.instance_fqdn,
            passkey_id: row.passkey_id,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }))
    }

    /// Find user by ID
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<User>> {
        let user = sqlx::query!(
            "SELECT id, username, display_name, instance_fqdn, passkey_id, created_at, updated_at FROM users WHERE id = $1",
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(user.map(|row| User {
            id: row.id,
            username: row.username,
            display_name: row.display_name,
            instance_fqdn: row.instance_fqdn,
            passkey_id: row.passkey_id,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }))
    }

    /// Find user by username and instance
    pub async fn find_by_username(pool: &PgPool, username: &str, instance_fqdn: &str) -> Result<Option<User>> {
        let user = sqlx::query!(
            "SELECT id, username, display_name, instance_fqdn, passkey_id, created_at, updated_at FROM users WHERE username = $1 AND instance_fqdn = $2",
            username,
            instance_fqdn
        )
        .fetch_optional(pool)
        .await?;

        Ok(user.map(|row| User {
            id: row.id,
            username: row.username,
            display_name: row.display_name,
            instance_fqdn: row.instance_fqdn,
            passkey_id: row.passkey_id,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }))
    }

    /// Update user
    pub async fn update(pool: &PgPool, id: Uuid, request: UpdateUserRequest) -> Result<User> {
        let user = sqlx::query!(
            r#"
            UPDATE users 
            SET display_name = COALESCE($2, display_name),
                passkey_id = COALESCE($3, passkey_id),
                updated_at = NOW()
            WHERE id = $1
            RETURNING id, username, display_name, instance_fqdn, passkey_id, created_at, updated_at
            "#,
            id,
            request.display_name,
            request.passkey_credential
        )
        .fetch_one(pool)
        .await?;

        Ok(User {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            instance_fqdn: user.instance_fqdn,
            passkey_id: user.passkey_id,
            created_at: user.created_at,
            updated_at: user.updated_at,
        })
    }
} 