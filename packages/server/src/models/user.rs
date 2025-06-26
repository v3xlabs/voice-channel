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
    pub is_temporary: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Object)]
pub struct CreateUserRequest {
    pub username: Option<String>,
    pub display_name: Option<String>,
    pub instance_fqdn: String,
}

#[derive(Debug, Serialize, Deserialize, Object)]
pub struct UpdateUserRequest {
    pub username: Option<String>,
    pub display_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Object)]
pub struct UserAuthResponse {
    pub user: User,
    pub is_new: bool,
}

impl User {
    /// Create a new user or return existing one
    pub async fn create_or_get(pool: &PgPool, request: CreateUserRequest) -> Result<UserAuthResponse> {
        // Generate temporary username if not provided
        let username = request.username.unwrap_or_else(|| {
            format!("user_{}", &Uuid::new_v4().to_string()[..8])
        });
        
        // Generate display name if not provided
        let display_name = request.display_name.unwrap_or_else(|| {
            format!("Anonymous User")
        });

        // Try to find existing user first
        if let Some(existing_user) = Self::find_by_username(pool, &username, &request.instance_fqdn).await? {
            return Ok(UserAuthResponse {
                user: existing_user,
                is_new: false,
            });
        }

        // Create new user
        let user = sqlx::query!(
            r#"
            INSERT INTO users (username, display_name, instance_fqdn, is_temporary)
            VALUES ($1, $2, $3, $4)
            RETURNING id, username, display_name, instance_fqdn, is_temporary, created_at, updated_at
            "#,
            username,
            display_name,
            request.instance_fqdn,
            true
        )
        .fetch_one(pool)
        .await?;

        let user = User {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            instance_fqdn: user.instance_fqdn,
            is_temporary: user.is_temporary,
            created_at: user.created_at,
            updated_at: user.updated_at,
        };

        Ok(UserAuthResponse {
            user,
            is_new: true,
        })
    }

    /// Find user by ID
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<User>> {
        let user = sqlx::query!(
            "SELECT id, username, display_name, instance_fqdn, is_temporary, created_at, updated_at FROM users WHERE id = $1",
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(user.map(|u| User {
            id: u.id,
            username: u.username,
            display_name: u.display_name,
            instance_fqdn: u.instance_fqdn,
            is_temporary: u.is_temporary,
            created_at: u.created_at,
            updated_at: u.updated_at,
        }))
    }

    /// Find user by username and instance
    pub async fn find_by_username(pool: &PgPool, username: &str, instance_fqdn: &str) -> Result<Option<User>> {
        let user = sqlx::query!(
            "SELECT id, username, display_name, instance_fqdn, is_temporary, created_at, updated_at FROM users WHERE username = $1 AND instance_fqdn = $2",
            username,
            instance_fqdn
        )
        .fetch_optional(pool)
        .await?;

        Ok(user.map(|u| User {
            id: u.id,
            username: u.username,
            display_name: u.display_name,
            instance_fqdn: u.instance_fqdn,
            is_temporary: u.is_temporary,
            created_at: u.created_at,
            updated_at: u.updated_at,
        }))
    }

    /// Update user profile
    pub async fn update(pool: &PgPool, id: Uuid, request: UpdateUserRequest) -> Result<User> {
        let user = sqlx::query!(
            r#"
            UPDATE users 
            SET username = COALESCE($2, username),
                display_name = COALESCE($3, display_name),
                is_temporary = CASE WHEN $2 IS NOT NULL OR $3 IS NOT NULL THEN false ELSE is_temporary END,
                updated_at = NOW()
            WHERE id = $1
            RETURNING id, username, display_name, instance_fqdn, is_temporary, created_at, updated_at
            "#,
            id,
            request.username,
            request.display_name
        )
        .fetch_one(pool)
        .await?;

        Ok(User {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            instance_fqdn: user.instance_fqdn,
            is_temporary: user.is_temporary,
            created_at: user.created_at,
            updated_at: user.updated_at,
        })
    }
} 