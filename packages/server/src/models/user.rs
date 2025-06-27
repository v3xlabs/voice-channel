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
    pub has_passkey: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Object)]
pub struct CreateUserRequest {
    pub username: String,
}

#[derive(Debug, Deserialize, Object)]
pub struct UpdateUserRequest {
    pub display_name: Option<String>,
    pub is_admin: Option<bool>,
}

#[derive(Debug, Serialize, Object)]
pub struct UserAuthResponse {
    pub user: User,
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

    /// Create a new user
    pub async fn create(
        pool: &PgPool,
        request: CreateUserRequest,
        instance_fqdn: String,
    ) -> Result<UserAuthResponse, AppError> {
        let display_name = request.username.clone();
        
        let user = sqlx::query_as!(
            User,
            r#"
            INSERT INTO users (username, display_name, instance_fqdn, is_admin, has_passkey)
            VALUES ($1, $2, $3, false, false)
            RETURNING user_id, username, display_name, instance_fqdn, is_admin, has_passkey, created_at, updated_at
            "#,
            request.username,
            display_name,
            instance_fqdn
        )
        .fetch_one(pool)
        .await?;

        Ok(UserAuthResponse { user })
    }

    /// Get user by username and instance
    pub async fn find_by_username(
        pool: &PgPool,
        username: &str,
        instance_fqdn: &str,
    ) -> Result<Option<User>, AppError> {
        let user = sqlx::query_as!(
            User,
            "SELECT user_id, username, display_name, instance_fqdn, is_admin, has_passkey, created_at, updated_at FROM users WHERE username = $1 AND instance_fqdn = $2",
            username,
            instance_fqdn
        )
        .fetch_optional(pool)
        .await?;

        Ok(user)
    }

    /// Authenticate user (login) - just finds existing user
    pub async fn authenticate(
        pool: &PgPool,
        username: &str,
        instance_fqdn: &str,
    ) -> Result<UserAuthResponse, AppError> {
        let user = Self::find_by_username(pool, username, instance_fqdn).await?;
        
        match user {
            Some(user) => Ok(UserAuthResponse { user }),
            None => Err(AppError::NotFound("User not found".to_string())),
        }
    }

    /// Get user by ID
    pub async fn find_by_id(pool: &PgPool, user_id: Uuid) -> Result<Option<User>, AppError> {
        let user = sqlx::query_as!(
            User,
            "SELECT user_id, username, display_name, instance_fqdn, is_admin, has_passkey, created_at, updated_at FROM users WHERE user_id = $1",
            user_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(user)
    }

    /// List all users for an instance (admin only)
    pub async fn list_by_instance(pool: &PgPool, instance_fqdn: &str) -> Result<Vec<User>, AppError> {
        let users = sqlx::query_as!(
            User,
            "SELECT user_id, username, display_name, instance_fqdn, is_admin, has_passkey, created_at, updated_at FROM users WHERE instance_fqdn = $1 ORDER BY created_at DESC",
            instance_fqdn
        )
        .fetch_all(pool)
        .await?;

        Ok(users)
    }

    /// Update user admin status
    pub async fn update_admin_status(
        pool: &PgPool,
        user_id: Uuid,
        is_admin: bool,
    ) -> Result<User, AppError> {
        let user = sqlx::query_as!(
            User,
            "UPDATE users SET is_admin = $2 WHERE user_id = $1 RETURNING user_id, username, display_name, instance_fqdn, is_admin, has_passkey, created_at, updated_at",
            user_id,
            is_admin
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

    pub async fn delete(pool: &PgPool, user_id: Uuid) -> Result<bool, AppError> {
        let result = sqlx::query!("DELETE FROM users WHERE user_id = $1", user_id)
            .execute(pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }
} 