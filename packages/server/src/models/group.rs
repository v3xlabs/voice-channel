use chrono::{DateTime, Utc};
use poem_openapi::Object;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::error::AppError;
use crate::models::user::User;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, Object)]
pub struct Group {
    pub group_id: Uuid,
    pub name: String,
    pub display_name: String,
    pub description: Option<String>,
    pub instance_fqdn: String,
    pub is_public: bool,
    pub can_create_channels: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, Object)]
pub struct GroupMembership {
    pub membership_id: Uuid,
    pub group_id: Uuid,
    pub user_id: Uuid,
    pub is_admin: bool,
    pub can_invite: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Object)]
pub struct GroupWithMembership {
    pub group_id: Uuid,
    pub name: String,
    pub display_name: String,
    pub description: Option<String>,
    pub instance_fqdn: String,
    pub is_public: bool,
    pub can_create_channels: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    // Membership info
    pub membership_id: Option<Uuid>,
    pub is_admin: bool,
    pub can_invite: bool,
    pub membership_created_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize, Object)]
pub struct CreateGroupRequest {
    pub name: String,
    pub display_name: String,
    pub description: Option<String>,
    pub is_public: Option<bool>,
    pub can_create_channels: Option<bool>,
}

#[derive(Debug, Deserialize, Object)]
pub struct UpdateGroupRequest {
    pub display_name: Option<String>,
    pub description: Option<String>,
    pub is_public: Option<bool>,
    pub can_create_channels: Option<bool>,
}

#[derive(Debug, Deserialize, Object)]
pub struct JoinGroupRequest {
    pub user_id: Uuid,
}

impl Group {
    /// Create a new group
    pub async fn create(
        pool: &PgPool,
        request: CreateGroupRequest,
        instance_fqdn: String,
        creator_id: Uuid,
    ) -> Result<Self, AppError> {
        let group = sqlx::query_as!(
            Group,
            r#"
            INSERT INTO groups (name, display_name, description, instance_fqdn, is_public, can_create_channels)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING group_id, name, display_name, description, instance_fqdn, is_public, can_create_channels, created_at, updated_at
            "#,
            request.name,
            request.display_name,
            request.description,
            instance_fqdn,
            request.is_public.unwrap_or(true),
            request.can_create_channels.unwrap_or(false)
        )
        .fetch_one(pool)
        .await?;

        // Add creator as admin member
        sqlx::query!(
            r#"
            INSERT INTO group_memberships (group_id, user_id, is_admin, can_invite)
            VALUES ($1, $2, true, true)
            "#,
            group.group_id,
            creator_id
        )
        .execute(pool)
        .await?;

        Ok(group)
    }

    /// List all groups for an instance
    pub async fn list_by_instance(pool: &PgPool, instance_fqdn: &str) -> Result<Vec<Self>, AppError> {
        let groups = sqlx::query_as!(
            Group,
            "SELECT group_id, name, display_name, description, instance_fqdn, is_public, can_create_channels, created_at, updated_at FROM groups WHERE instance_fqdn = $1 ORDER BY created_at DESC",
            instance_fqdn
        )
        .fetch_all(pool)
        .await?;

        Ok(groups)
    }

    /// List public groups for an instance
    pub async fn list_public_by_instance(pool: &PgPool, instance_fqdn: &str) -> Result<Vec<Self>, AppError> {
        let groups = sqlx::query_as!(
            Group,
            "SELECT group_id, name, display_name, description, instance_fqdn, is_public, can_create_channels, created_at, updated_at FROM groups WHERE instance_fqdn = $1 AND is_public = true ORDER BY created_at DESC",
            instance_fqdn
        )
        .fetch_all(pool)
        .await?;

        Ok(groups)
    }

    /// Find group by name and instance
    pub async fn find_by_name(pool: &PgPool, name: &str, instance_fqdn: &str) -> Result<Option<Self>, AppError> {
        let group = sqlx::query_as!(
            Group,
            "SELECT group_id, name, display_name, description, instance_fqdn, is_public, can_create_channels, created_at, updated_at FROM groups WHERE name = $1 AND instance_fqdn = $2",
            name,
            instance_fqdn
        )
        .fetch_optional(pool)
        .await?;

        Ok(group)
    }

    /// Find group by ID
    pub async fn find_by_id(pool: &PgPool, group_id: Uuid) -> Result<Option<Self>, AppError> {
        let group = sqlx::query_as!(
            Group,
            "SELECT group_id, name, display_name, description, instance_fqdn, is_public, can_create_channels, created_at, updated_at FROM groups WHERE group_id = $1",
            group_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(group)
    }

    /// Update group
    pub async fn update(pool: &PgPool, group_id: Uuid, request: UpdateGroupRequest) -> Result<Self, AppError> {
        let group = sqlx::query_as!(
            Group,
            r#"
            UPDATE groups 
            SET display_name = COALESCE($2, display_name),
                description = COALESCE($3, description),
                is_public = COALESCE($4, is_public),
                can_create_channels = COALESCE($5, can_create_channels)
            WHERE group_id = $1
            RETURNING group_id, name, display_name, description, instance_fqdn, is_public, can_create_channels, created_at, updated_at
            "#,
            group_id,
            request.display_name,
            request.description,
            request.is_public,
            request.can_create_channels
        )
        .fetch_one(pool)
        .await?;

        Ok(group)
    }

    /// Get user's groups
    pub async fn get_user_groups(pool: &PgPool, user_id: Uuid, instance_fqdn: &str) -> Result<Vec<GroupWithMembership>, AppError> {
        let records = sqlx::query!(
            r#"
            SELECT 
                g.group_id as group_id, g.name as group_name, g.display_name as group_display_name, 
                g.description as group_description, g.instance_fqdn as group_instance_fqdn,
                g.is_public as group_is_public, g.can_create_channels as group_can_create_channels,
                g.created_at as group_created_at, g.updated_at as group_updated_at,
                gm.membership_id as membership_id, gm.is_admin as membership_is_admin, 
                gm.can_invite as membership_can_invite, gm.created_at as membership_created_at
            FROM groups g
            JOIN group_memberships gm ON g.group_id = gm.group_id
            WHERE gm.user_id = $1 AND g.instance_fqdn = $2
            ORDER BY g.created_at DESC
            "#,
            user_id,
            instance_fqdn
        )
        .fetch_all(pool)
        .await?;

        let groups = records
            .into_iter()
            .map(|row| GroupWithMembership {
                group_id: row.group_id,
                name: row.group_name,
                display_name: row.group_display_name,
                description: row.group_description,
                instance_fqdn: row.group_instance_fqdn,
                is_public: row.group_is_public,
                can_create_channels: row.group_can_create_channels,
                created_at: row.group_created_at,
                updated_at: row.group_updated_at,
                membership_id: Some(row.membership_id),
                is_admin: row.membership_is_admin,
                can_invite: row.membership_can_invite,
                membership_created_at: Some(row.membership_created_at),
            })
            .collect();

        Ok(groups)
    }
}

impl GroupMembership {
    /// Join a group
    pub async fn join_group(pool: &PgPool, group_id: Uuid, user_id: Uuid) -> Result<Self, AppError> {
        let membership = sqlx::query_as!(
            GroupMembership,
            r#"
            INSERT INTO group_memberships (group_id, user_id, is_admin, can_invite)
            VALUES ($1, $2, false, true)
            RETURNING membership_id, group_id, user_id, is_admin, can_invite, created_at
            "#,
            group_id,
            user_id
        )
        .fetch_one(pool)
        .await?;

        Ok(membership)
    }

    /// Leave a group
    pub async fn leave_group(pool: &PgPool, group_id: Uuid, user_id: Uuid) -> Result<bool, AppError> {
        let result = sqlx::query!(
            "DELETE FROM group_memberships WHERE group_id = $1 AND user_id = $2",
            group_id,
            user_id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Get group members
    pub async fn get_group_members(pool: &PgPool, group_id: Uuid) -> Result<Vec<User>, AppError> {
        let users = sqlx::query_as!(
            User,
            r#"
            SELECT u.user_id, u.username, u.display_name, u.instance_fqdn, u.is_admin, u.created_at, u.updated_at
            FROM users u
            JOIN group_memberships gm ON u.user_id = gm.user_id
            WHERE gm.group_id = $1
            ORDER BY gm.created_at ASC
            "#,
            group_id
        )
        .fetch_all(pool)
        .await?;

        Ok(users)
    }

    /// Check if user is member of group
    pub async fn is_member(pool: &PgPool, group_id: Uuid, user_id: Uuid) -> Result<bool, AppError> {
        let exists = sqlx::query!(
            "SELECT EXISTS(SELECT 1 FROM group_memberships WHERE group_id = $1 AND user_id = $2) as exists",
            group_id,
            user_id
        )
        .fetch_one(pool)
        .await?;

        Ok(exists.exists.unwrap_or(false))
    }

    /// Check if user is admin of group
    pub async fn is_admin(pool: &PgPool, group_id: Uuid, user_id: Uuid) -> Result<bool, AppError> {
        let is_admin = sqlx::query!(
            "SELECT is_admin FROM group_memberships WHERE group_id = $1 AND user_id = $2",
            group_id,
            user_id
        )
        .fetch_optional(pool)
        .await?
        .map(|row| row.is_admin)
        .unwrap_or(false);

        Ok(is_admin)
    }
} 