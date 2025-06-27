use chrono::{DateTime, Utc};
use poem_openapi::Object;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;
use anyhow::Result;

use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, Object)]
pub struct User {
    pub user_id: Uuid,
    pub username: String,
    pub display_name: String,
    pub instance_fqdn: String,
    pub is_admin: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Object)]
pub struct CreateUserRequest {
    pub username: String,
    pub display_name: String,
}

#[derive(Debug, Deserialize, Object)]
pub struct UpdateUserRequest {
    pub display_name: Option<String>,
    pub is_admin: Option<bool>,
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
    pub async fn create(
        pool: &PgPool,
        request: CreateUserRequest,
        instance_fqdn: String,
    ) -> Result<Self, AppError> {
        let user = sqlx::query_as!(
            User,
            r#"
            INSERT INTO users (username, display_name, instance_fqdn)
            VALUES ($1, $2, $3)
            RETURNING user_id, username, display_name, instance_fqdn, is_admin, created_at, updated_at
            "#,
            request.username,
            request.display_name,
            instance_fqdn
        )
        .fetch_one(pool)
        .await?;

        Ok(user)
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
            username: username.to_string(),
            display_name: display_name.to_string(),
        };
        
        Self::create(pool, request, instance_fqdn.to_string()).await?;
        Self::find_by_username(pool, username, instance_fqdn).await
    }

    /// Find user by ID
    pub async fn find_by_id(pool: &PgPool, user_id: Uuid) -> Result<Option<Self>, AppError> {
        let user = sqlx::query_as!(
            User,
            "SELECT user_id, username, display_name, instance_fqdn, is_admin, created_at, updated_at FROM users WHERE user_id = $1",
            user_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(user)
    }

    /// Find user by username and instance
    pub async fn find_by_username(
        pool: &PgPool,
        username: &str,
        instance_fqdn: &str,
    ) -> Result<Option<Self>, AppError> {
        let user = sqlx::query_as!(
            User,
            "SELECT user_id, username, display_name, instance_fqdn, is_admin, created_at, updated_at FROM users WHERE username = $1 AND instance_fqdn = $2",
            username,
            instance_fqdn
        )
        .fetch_optional(pool)
        .await?;

        Ok(user)
    }

    /// Update user
    pub async fn update(
        pool: &PgPool,
        user_id: Uuid,
        request: UpdateUserRequest,
    ) -> Result<Self, AppError> {
        let user = sqlx::query_as!(
            User,
            r#"
            UPDATE users 
            SET display_name = COALESCE($2, display_name),
                is_admin = COALESCE($3, is_admin)
            WHERE user_id = $1
            RETURNING user_id, username, display_name, instance_fqdn, is_admin, created_at, updated_at
            "#,
            user_id,
            request.display_name,
            request.is_admin
        )
        .fetch_one(pool)
        .await?;

        Ok(user)
    }

    pub async fn list_all(pool: &PgPool) -> Result<Vec<Self>, AppError> {
        let users = sqlx::query_as!(
            User,
            "SELECT user_id, username, display_name, instance_fqdn, is_admin, created_at, updated_at FROM users ORDER BY created_at DESC"
        )
        .fetch_all(pool)
        .await?;

        Ok(users)
    }

    pub async fn list_by_instance(pool: &PgPool, instance_fqdn: &str) -> Result<Vec<Self>, AppError> {
        let users = sqlx::query_as!(
            User,
            "SELECT user_id, username, display_name, instance_fqdn, is_admin, created_at, updated_at FROM users WHERE instance_fqdn = $1 ORDER BY created_at DESC",
            instance_fqdn
        )
        .fetch_all(pool)
        .await?;

        Ok(users)
    }

    pub async fn delete(pool: &PgPool, user_id: Uuid) -> Result<bool, AppError> {
        let result = sqlx::query!("DELETE FROM users WHERE user_id = $1", user_id)
            .execute(pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }
} 