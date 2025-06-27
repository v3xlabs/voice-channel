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
    pub is_admin: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Object)]
pub struct CreateUserRequest {
    pub display_name: String,
    pub instance_fqdn: String,
}

#[derive(Debug, Deserialize, Object)]
pub struct UpdateUserRequest {
    pub display_name: Option<String>,
}

#[derive(Debug, Serialize, Object)]
pub struct UserAuthResponse {
    pub user: User,
    pub is_new: bool,
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
            INSERT INTO users (id, username, display_name, instance_fqdn)
            VALUES ($1, $2, $3, $4)
            RETURNING id, username, display_name, instance_fqdn, is_admin, created_at, updated_at
            "#,
            Uuid::new_v4(),
            username,
            request.display_name,
            request.instance_fqdn
        )
        .fetch_one(pool)
        .await?;

        let user = User {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            instance_fqdn: user.instance_fqdn,
            is_admin: user.is_admin,
            created_at: user.created_at,
            updated_at: user.updated_at,
        };

        Ok(UserAuthResponse {
            user,
            is_new: true,
        })
    }

    /// Create or get user by username (simplified auth)
    pub async fn create_or_get(pool: &PgPool, username: &str, display_name: &str, instance_fqdn: &str) -> Result<UserAuthResponse> {
        // Try to find existing user
        if let Some(user) = Self::find_by_username(pool, username, instance_fqdn).await? {
            return Ok(UserAuthResponse {
                user,
                is_new: false,
            });
        }

        // Create new user
        let request = CreateUserRequest {
            display_name: display_name.to_string(),
            instance_fqdn: instance_fqdn.to_string(),
        };
        
        Self::create(pool, request).await
    }

    /// Find user by ID
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<User>> {
        let user = sqlx::query!(
            "SELECT id, username, display_name, instance_fqdn, is_admin, created_at, updated_at FROM users WHERE id = $1",
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(user.map(|row| User {
            id: row.id,
            username: row.username,
            display_name: row.display_name,
            instance_fqdn: row.instance_fqdn,
            is_admin: row.is_admin,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }))
    }

    /// Find user by username and instance
    pub async fn find_by_username(pool: &PgPool, username: &str, instance_fqdn: &str) -> Result<Option<User>> {
        let user = sqlx::query!(
            "SELECT id, username, display_name, instance_fqdn, is_admin, created_at, updated_at FROM users WHERE username = $1 AND instance_fqdn = $2",
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
            is_admin: row.is_admin,
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
                updated_at = NOW()
            WHERE id = $1
            RETURNING id, username, display_name, instance_fqdn, is_admin, created_at, updated_at
            "#,
            id,
            request.display_name
        )
        .fetch_one(pool)
        .await?;

        Ok(User {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            instance_fqdn: user.instance_fqdn,
            is_admin: user.is_admin,
            created_at: user.created_at,
            updated_at: user.updated_at,
        })
    }
} 