use chrono::{DateTime, Utc};
use poem_openapi::Object;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;
use anyhow::Result;

use super::channel::Channel;
use super::user::User;

#[derive(Debug, Clone, Serialize, Deserialize, Object)]
pub struct ChannelMembership {
    pub id: Uuid,
    pub user_id: Uuid,
    pub channel_instance_fqdn: String,
    pub channel_name: String,
    pub joined_at: DateTime<Utc>,
    pub last_active: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Object)]
pub struct ChannelWithMembership {
    pub channel: Option<Channel>, // None for remote channels
    pub membership: ChannelMembership,
    pub is_local: bool,
}

#[derive(Debug, Serialize, Deserialize, Object)]
pub struct JoinChannelMembershipRequest {
    pub user_id: Uuid,
    pub channel_instance_fqdn: String,
    pub channel_name: String,
}

impl ChannelMembership {
    /// Join a channel (become a member, not voice call)
    pub async fn join_channel(
        pool: &PgPool, 
        user_id: Uuid, 
        channel_instance_fqdn: String,
        channel_name: String
    ) -> Result<ChannelMembership> {
        // Use INSERT ... ON CONFLICT to handle duplicate joins gracefully
        let membership = sqlx::query!(
            r#"
            INSERT INTO channel_memberships (user_id, channel_instance_fqdn, channel_name)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, channel_instance_fqdn, channel_name) 
            DO UPDATE SET last_active = NOW()
            RETURNING id, user_id, channel_instance_fqdn, channel_name, joined_at, last_active
            "#,
            user_id,
            channel_instance_fqdn,
            channel_name
        )
        .fetch_one(pool)
        .await?;

        Ok(ChannelMembership {
            id: membership.id,
            user_id: membership.user_id,
            channel_instance_fqdn: membership.channel_instance_fqdn,
            channel_name: membership.channel_name,
            joined_at: membership.joined_at,
            last_active: membership.last_active,
        })
    }

    /// Leave a channel (remove membership)
    pub async fn leave_channel(
        pool: &PgPool, 
        user_id: Uuid, 
        channel_instance_fqdn: String,
        channel_name: String
    ) -> Result<bool> {
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

    /// Get all channels a user is a member of
    pub async fn get_user_channels(
        pool: &PgPool, 
        user_id: Uuid, 
        current_instance_fqdn: &str
    ) -> Result<Vec<ChannelWithMembership>> {
        // First, get all memberships for the user
        let membership_rows = sqlx::query!(
            r#"
            SELECT 
                id,
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

        let mut channels = Vec::new();

        for row in membership_rows {
            let membership = ChannelMembership {
                id: row.id,
                user_id: row.user_id,
                channel_instance_fqdn: row.channel_instance_fqdn.clone(),
                channel_name: row.channel_name.clone(),
                joined_at: row.joined_at,
                last_active: row.last_active,
            };

            let is_local = row.channel_instance_fqdn == current_instance_fqdn;
            
            // For local channels, try to fetch the full channel data
            let channel = if is_local {
                let channel_result = sqlx::query_as!(
                    Channel,
                    "SELECT * FROM channels WHERE instance_fqdn = $1 AND name = $2",
                    row.channel_instance_fqdn,
                    row.channel_name
                )
                .fetch_optional(pool)
                .await?;
                
                channel_result
            } else {
                None
            };

            channels.push(ChannelWithMembership {
                channel,
                membership,
                is_local,
            });
        }

        Ok(channels)
    }

    /// Get all members of a local channel
    pub async fn get_channel_members(
        pool: &PgPool, 
        channel_instance_fqdn: String,
        channel_name: String
    ) -> Result<Vec<User>> {
        let rows = sqlx::query!(
            r#"
            SELECT 
                u.id,
                u.username,
                u.display_name,
                u.instance_fqdn,
                u.is_temporary,
                u.created_at,
                u.updated_at
            FROM channel_memberships cm
            JOIN users u ON cm.user_id = u.id
            WHERE cm.channel_instance_fqdn = $1 AND cm.channel_name = $2
            ORDER BY cm.joined_at ASC
            "#,
            channel_instance_fqdn,
            channel_name
        )
        .fetch_all(pool)
        .await?;

        let users = rows
            .into_iter()
            .map(|row| User {
                id: row.id,
                username: row.username,
                display_name: row.display_name,
                instance_fqdn: row.instance_fqdn,
                is_temporary: row.is_temporary,
                created_at: row.created_at,
                updated_at: row.updated_at,
            })
            .collect();

        Ok(users)
    }

    /// Check if user is a member of a channel
    pub async fn is_member(
        pool: &PgPool, 
        user_id: Uuid, 
        channel_instance_fqdn: String,
        channel_name: String
    ) -> Result<bool> {
        let count = sqlx::query!(
            "SELECT COUNT(*) as count FROM channel_memberships WHERE user_id = $1 AND channel_instance_fqdn = $2 AND channel_name = $3",
            user_id,
            channel_instance_fqdn,
            channel_name
        )
        .fetch_one(pool)
        .await?;

        Ok(count.count.unwrap_or(0) > 0)
    }

    /// Update last active timestamp
    pub async fn update_last_active(
        pool: &PgPool, 
        user_id: Uuid, 
        channel_instance_fqdn: String,
        channel_name: String
    ) -> Result<()> {
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
} 