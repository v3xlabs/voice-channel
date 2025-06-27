use chrono::{DateTime, Utc};
use poem_openapi::Object;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;
use anyhow::Result;

use super::channel::Channel;
use super::user::User;

use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, Object)]
pub struct ChannelMembership {
    pub membership_id: Uuid,
    pub user_id: Uuid,
    pub channel_instance_fqdn: String,
    pub channel_name: String,
    pub joined_at: DateTime<Utc>,
    pub last_active: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Object)]
pub struct JoinChannelRequest {
    pub channel_instance_fqdn: String,
    pub channel_name: String,
}

#[derive(Debug, Serialize, Object)]
pub struct ChannelMembershipWithChannel {
    pub membership_id: Uuid,
    pub user_id: Uuid,
    pub channel_instance_fqdn: String,
    pub channel_name: String,
    pub joined_at: DateTime<Utc>,
    pub last_active: DateTime<Utc>,
    pub channel: Option<Channel>,
}

impl ChannelMembership {
    /// Join a channel
    pub async fn join_channel(
        pool: &PgPool,
        user_id: Uuid,
        request: JoinChannelRequest,
    ) -> Result<Self, AppError> {
        let membership = sqlx::query!(
            r#"
            INSERT INTO channel_memberships (user_id, channel_instance_fqdn, channel_name)
            VALUES ($1, $2, $3)
            RETURNING membership_id, user_id, channel_instance_fqdn, channel_name, joined_at, last_active
            "#,
            user_id,
            request.channel_instance_fqdn,
            request.channel_name
        )
        .fetch_one(pool)
        .await?;

        Ok(ChannelMembership {
            membership_id: membership.membership_id,
            user_id: membership.user_id,
            channel_instance_fqdn: membership.channel_instance_fqdn,
            channel_name: membership.channel_name,
            joined_at: membership.joined_at,
            last_active: membership.last_active,
        })
    }

    /// Leave a channel
    pub async fn leave_channel(
        pool: &PgPool,
        user_id: Uuid,
        channel_instance_fqdn: &str,
        channel_name: &str,
    ) -> Result<bool, AppError> {
        let result = sqlx::query!(
            "DELETE FROM channel_memberships WHERE user_id = $1 AND channel_instance_fqdn = $2 AND channel_name = $3",
            user_id,
            channel_instance_fqdn,
            channel_name
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Get user's channel memberships with channel details
    pub async fn get_user_channels(
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Vec<ChannelMembershipWithChannel>, AppError> {
        let membership_rows = sqlx::query!(
            r#"
            SELECT 
                membership_id,
                user_id,
                channel_instance_fqdn,
                channel_name,
                joined_at,
                last_active
            FROM channel_memberships 
            WHERE user_id = $1
            ORDER BY last_active DESC
            "#,
            user_id
        )
        .fetch_all(pool)
        .await?;

        let mut result = Vec::new();

        for row in membership_rows {
            // Try to get channel details if it exists on this instance
            let channel_result = sqlx::query_as!(
                Channel,
                "SELECT channel_id, name, description, instance_fqdn, group_id, max_participants, current_participants, created_at, updated_at FROM channels WHERE instance_fqdn = $1 AND name = $2",
                row.channel_instance_fqdn,
                row.channel_name
            )
            .fetch_optional(pool)
            .await?;

            result.push(ChannelMembershipWithChannel {
                membership_id: row.membership_id,
                user_id: row.user_id,
                channel_instance_fqdn: row.channel_instance_fqdn,
                channel_name: row.channel_name,
                joined_at: row.joined_at,
                last_active: row.last_active,
                channel: channel_result,
            });
        }

        Ok(result)
    }

    /// Get users in a channel
    pub async fn get_channel_members(
        pool: &PgPool,
        channel_instance_fqdn: &str,
        channel_name: &str,
    ) -> Result<Vec<User>, AppError> {
        let rows = sqlx::query!(
            r#"
            SELECT 
                u.user_id,
                u.username,
                u.display_name,
                u.instance_fqdn,
                u.is_admin,
                u.has_passkey,
                u.created_at,
                u.updated_at
            FROM users u
            INNER JOIN channel_memberships cm ON u.user_id = cm.user_id
            WHERE cm.channel_instance_fqdn = $1 AND cm.channel_name = $2
            ORDER BY cm.joined_at
            "#,
            channel_instance_fqdn,
            channel_name
        )
        .fetch_all(pool)
        .await?;

        let users = rows
            .into_iter()
            .map(|row| User {
                user_id: row.user_id,
                username: row.username,
                display_name: row.display_name,
                instance_fqdn: row.instance_fqdn,
                is_admin: row.is_admin,
                has_passkey: row.has_passkey,
                created_at: row.created_at,
                updated_at: row.updated_at,
            })
            .collect();

        Ok(users)
    }

    /// Update last active time for a user in a channel
    pub async fn update_last_active(
        pool: &PgPool,
        user_id: Uuid,
        channel_instance_fqdn: &str,
        channel_name: &str,
    ) -> Result<(), AppError> {
        sqlx::query!(
            "UPDATE channel_memberships SET last_active = NOW() WHERE user_id = $1 AND channel_instance_fqdn = $2 AND channel_name = $3",
            user_id,
            channel_instance_fqdn,
            channel_name
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Check if user is member of channel
    pub async fn is_member(
        pool: &PgPool,
        user_id: Uuid,
        channel_instance_fqdn: &str,
        channel_name: &str,
    ) -> Result<bool, AppError> {
        let exists = sqlx::query_scalar!(
            "SELECT EXISTS(SELECT 1 FROM channel_memberships WHERE user_id = $1 AND channel_instance_fqdn = $2 AND channel_name = $3)",
            user_id,
            channel_instance_fqdn,
            channel_name
        )
        .fetch_one(pool)
        .await?;

        Ok(exists.unwrap_or(false))
    }
} 