use chrono::{DateTime, Utc};
use poem_openapi::Object;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::error::AppError;
use crate::models::user::User;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, Object)]
pub struct UserPermissions {
    pub permission_id: Uuid,
    pub user_id: Uuid,
    pub instance_fqdn: String,
    pub can_create_groups: bool,
    pub can_create_channels_global: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Object)]
pub struct CreateUserPermissionsRequest {
    pub can_create_groups: Option<bool>,
    pub can_create_channels_global: Option<bool>,
}

#[derive(Debug, Deserialize, Object)]
pub struct UpdateUserPermissionsRequest {
    pub can_create_groups: Option<bool>,
    pub can_create_channels_global: Option<bool>,
}

impl UserPermissions {
    /// Create or get user permissions
    pub async fn create_or_get(
        pool: &PgPool,
        user_id: Uuid,
        instance_fqdn: String,
    ) -> Result<Self, AppError> {
        let permissions = sqlx::query_as!(
            UserPermissions,
            r#"
            INSERT INTO user_permissions (user_id, instance_fqdn, can_create_groups, can_create_channels_global)
            VALUES ($1, $2, false, false)
            ON CONFLICT (user_id, instance_fqdn) DO UPDATE SET user_id = EXCLUDED.user_id
            RETURNING permission_id, user_id, instance_fqdn, can_create_groups, can_create_channels_global, created_at, updated_at
            "#,
            user_id,
            instance_fqdn
        )
        .fetch_one(pool)
        .await?;

        Ok(permissions)
    }

    /// Find permissions by user and instance
    pub async fn find_by_user(
        pool: &PgPool,
        user_id: Uuid,
        instance_fqdn: &str,
    ) -> Result<Option<Self>, AppError> {
        let permissions = sqlx::query_as!(
            UserPermissions,
            "SELECT permission_id, user_id, instance_fqdn, can_create_groups, can_create_channels_global, created_at, updated_at FROM user_permissions WHERE user_id = $1 AND instance_fqdn = $2",
            user_id,
            instance_fqdn
        )
        .fetch_optional(pool)
        .await?;

        Ok(permissions)
    }

    /// Update user permissions
    pub async fn update(
        pool: &PgPool,
        user_id: Uuid,
        instance_fqdn: &str,
        request: UpdateUserPermissionsRequest,
    ) -> Result<Self, AppError> {
        let permissions = sqlx::query_as!(
            UserPermissions,
            r#"
            UPDATE user_permissions 
            SET can_create_groups = COALESCE($3, can_create_groups),
                can_create_channels_global = COALESCE($4, can_create_channels_global)
            WHERE user_id = $1 AND instance_fqdn = $2
            RETURNING permission_id, user_id, instance_fqdn, can_create_groups, can_create_channels_global, created_at, updated_at
            "#,
            user_id,
            instance_fqdn,
            request.can_create_groups,
            request.can_create_channels_global
        )
        .fetch_one(pool)
        .await?;

        Ok(permissions)
    }

    /// Check if user can create groups
    pub async fn can_create_groups(
        pool: &PgPool,
        user_id: Uuid,
        instance_fqdn: &str,
    ) -> Result<bool, AppError> {
        // Check if user is admin first
        let user = User::find_by_id(pool, user_id).await?;
        if let Some(user) = user {
            if user.is_admin && user.instance_fqdn == instance_fqdn {
                return Ok(true);
            }
        }

        // Check user permissions
        let permissions = Self::find_by_user(pool, user_id, instance_fqdn).await?;
        Ok(permissions.map(|p| p.can_create_groups).unwrap_or(false))
    }

    /// Check if user can create channels globally
    pub async fn can_create_channels_global(
        pool: &PgPool,
        user_id: Uuid,
        instance_fqdn: &str,
    ) -> Result<bool, AppError> {
        // Check if user is admin first
        let user = User::find_by_id(pool, user_id).await?;
        if let Some(user) = user {
            if user.is_admin && user.instance_fqdn == instance_fqdn {
                return Ok(true);
            }
        }

        // Check user permissions
        let permissions = Self::find_by_user(pool, user_id, instance_fqdn).await?;
        Ok(permissions.map(|p| p.can_create_channels_global).unwrap_or(false))
    }

    /// List all users with their permissions for an instance
    pub async fn list_users_with_permissions(
        pool: &PgPool,
        instance_fqdn: &str,
    ) -> Result<Vec<(User, Option<UserPermissions>)>, AppError> {
        let records = sqlx::query!(
            r#"
            SELECT 
                u.user_id as user_id, u.username, u.display_name, u.instance_fqdn, u.is_admin, u.created_at as user_created_at, u.updated_at as user_updated_at,
                up.permission_id, up.can_create_groups, up.can_create_channels_global, up.created_at as perm_created_at, up.updated_at as perm_updated_at
            FROM users u
            LEFT JOIN user_permissions up ON u.user_id = up.user_id AND up.instance_fqdn = $1
            WHERE u.instance_fqdn = $1
            ORDER BY u.created_at DESC
            "#,
            instance_fqdn
        )
        .fetch_all(pool)
        .await?;

        let users_permissions = records
            .into_iter()
            .map(|row| {
                let user = User {
                    user_id: row.user_id,
                    username: row.username,
                    display_name: row.display_name,
                    instance_fqdn: row.instance_fqdn,
                    is_admin: row.is_admin,
                    created_at: row.user_created_at,
                    updated_at: row.user_updated_at,
                };

                let permissions = row.permission_id.map(|permission_id| UserPermissions {
                    permission_id,
                    user_id: row.user_id,
                    instance_fqdn: instance_fqdn.to_string(),
                    can_create_groups: row.can_create_groups.unwrap_or(false),
                    can_create_channels_global: row.can_create_channels_global.unwrap_or(false),
                    created_at: row.perm_created_at.unwrap(),
                    updated_at: row.perm_updated_at.unwrap(),
                });

                (user, permissions)
            })
            .collect();

        Ok(users_permissions)
    }
} 