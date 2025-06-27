use chrono::{DateTime, Utc};
use poem_openapi::Object;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, Object)]
pub struct Channel {
    pub channel_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub instance_fqdn: String,
    pub group_id: Uuid,
    pub max_participants: i32,
    pub current_participants: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Object)]
pub struct CreateChannelRequest {
    pub name: String,
    pub description: Option<String>,
    pub group_id: Uuid,
    pub max_participants: Option<i32>,
}

impl Channel {
    pub async fn create(
        pool: &PgPool,
        request: CreateChannelRequest,
        instance_fqdn: String,
    ) -> Result<Self, AppError> {
        let channel = sqlx::query_as!(
            Channel,
            r#"
            INSERT INTO channels (name, description, instance_fqdn, group_id, max_participants, current_participants)
            VALUES ($1, $2, $3, $4, $5, 0)
            RETURNING channel_id, name, description, instance_fqdn, group_id, max_participants, current_participants, created_at, updated_at
            "#,
            request.name,
            request.description,
            instance_fqdn,
            request.group_id,
            request.max_participants.unwrap_or(50)
        )
        .fetch_one(pool)
        .await?;

        Ok(channel)
    }

    pub async fn list_all(pool: &PgPool) -> Result<Vec<Self>, AppError> {
        let channels = sqlx::query_as!(Channel, "SELECT channel_id, name, description, instance_fqdn, group_id, max_participants, current_participants, created_at, updated_at FROM channels ORDER BY created_at DESC")
            .fetch_all(pool)
            .await?;

        Ok(channels)
    }

    pub async fn find_by_name_and_group(pool: &PgPool, name: &str, group_id: Uuid) -> Result<Option<Self>, AppError> {
        let channel = sqlx::query_as!(Channel, "SELECT channel_id, name, description, instance_fqdn, group_id, max_participants, current_participants, created_at, updated_at FROM channels WHERE name = $1 AND group_id = $2", name, group_id)
            .fetch_optional(pool)
            .await?;

        Ok(channel)
    }

    pub async fn find_by_name(pool: &PgPool, name: &str) -> Result<Option<Self>, AppError> {
        let channel = sqlx::query_as!(Channel, "SELECT channel_id, name, description, instance_fqdn, group_id, max_participants, current_participants, created_at, updated_at FROM channels WHERE name = $1", name)
            .fetch_optional(pool)
            .await?;

        Ok(channel)
    }

    pub async fn find_by_id(pool: &PgPool, channel_id: Uuid) -> Result<Option<Self>, AppError> {
        let channel = sqlx::query_as!(Channel, "SELECT channel_id, name, description, instance_fqdn, group_id, max_participants, current_participants, created_at, updated_at FROM channels WHERE channel_id = $1", channel_id)
            .fetch_optional(pool)
            .await?;

        Ok(channel)
    }

    pub async fn find_by_group(pool: &PgPool, group_id: Uuid) -> Result<Vec<Self>, AppError> {
        let channels = sqlx::query_as!(Channel, "SELECT channel_id, name, description, instance_fqdn, group_id, max_participants, current_participants, created_at, updated_at FROM channels WHERE group_id = $1 ORDER BY created_at DESC", group_id)
            .fetch_all(pool)
            .await?;

        Ok(channels)
    }
} 