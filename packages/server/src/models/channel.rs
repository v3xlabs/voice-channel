use chrono::{DateTime, Utc};
use poem_openapi::Object;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{database::Database, error::AppError};

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, Object)]
pub struct Channel {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub instance_fqdn: String,
    pub max_participants: i32,
    pub current_participants: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Object)]
pub struct CreateChannelRequest {
    pub name: String,
    pub description: Option<String>,
    pub max_participants: Option<i32>,
}

impl Channel {
    pub async fn create(
        db: &Database,
        request: CreateChannelRequest,
        instance_fqdn: String,
    ) -> Result<Self, AppError> {
        let channel = sqlx::query_as!(
            Channel,
            r#"
            INSERT INTO channels (id, name, description, instance_fqdn, max_participants, current_participants)
            VALUES ($1, $2, $3, $4, $5, 0)
            RETURNING *
            "#,
            Uuid::new_v4(),
            request.name,
            request.description,
            instance_fqdn,
            request.max_participants.unwrap_or(50)
        )
        .fetch_one(&db.pool)
        .await?;

        Ok(channel)
    }

    pub async fn list_all(db: &Database) -> Result<Vec<Self>, AppError> {
        let channels = sqlx::query_as!(Channel, "SELECT * FROM channels ORDER BY created_at DESC")
            .fetch_all(&db.pool)
            .await?;

        Ok(channels)
    }

    pub async fn find_by_name(db: &Database, name: &str) -> Result<Option<Self>, AppError> {
        let channel = sqlx::query_as!(Channel, "SELECT * FROM channels WHERE name = $1", name)
            .fetch_optional(&db.pool)
            .await?;

        Ok(channel)
    }

    pub async fn find_by_id(db: &Database, id: Uuid) -> Result<Option<Self>, AppError> {
        let channel = sqlx::query_as!(Channel, "SELECT * FROM channels WHERE id = $1", id)
            .fetch_optional(&db.pool)
            .await?;

        Ok(channel)
    }
} 