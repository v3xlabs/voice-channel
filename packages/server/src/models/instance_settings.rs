use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use poem_openapi::Object;
use sqlx::{FromRow};

use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, Object)]
pub struct InstanceSettings {
    pub settings_id: Uuid,
    pub instance_fqdn: String,
    pub registration_mode: String,
    pub invite_permission: String,
    pub invite_limit: Option<i32>,
    pub instance_name: String,
    pub instance_description: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RegistrationMode {
    #[serde(rename = "open")]
    Open,
    #[serde(rename = "invite-only")]
    InviteOnly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum InvitePermission {
    #[serde(rename = "admin-only")]
    AdminOnly,
    #[serde(rename = "anyone")]
    Anyone,
    #[serde(rename = "limited")]
    Limited,
}

#[derive(Debug, Deserialize, Object)]
pub struct UpdateInstanceSettingsRequest {
    pub registration_mode: Option<String>,
    pub invite_permission: Option<String>,
    pub invite_limit: Option<i32>,
    pub instance_name: Option<String>,
    pub instance_description: Option<String>,
}

impl InstanceSettings {
    /// Get instance settings by FQDN
    pub async fn get_by_fqdn(
        pool: &PgPool,
        instance_fqdn: &str,
    ) -> Result<Option<Self>, AppError> {
        let row = sqlx::query!(
            r#"
            SELECT settings_id, instance_fqdn, registration_mode, invite_permission, 
                   invite_limit, instance_name, instance_description, 
                   created_at, updated_at
            FROM instance_settings 
            WHERE instance_fqdn = $1
            "#,
            instance_fqdn
        )
        .fetch_optional(pool)
        .await?;

        if let Some(row) = row {
            Ok(Some(InstanceSettings {
                settings_id: row.settings_id,
                instance_fqdn: row.instance_fqdn,
                registration_mode: row.registration_mode,
                invite_permission: row.invite_permission,
                invite_limit: row.invite_limit,
                instance_name: row.instance_name,
                instance_description: row.instance_description,
                created_at: row.created_at,
                updated_at: row.updated_at,
            }))
        } else {
            Ok(None)
        }
    }

    /// Create default instance settings
    pub async fn create_default(
        pool: &PgPool,
        instance_fqdn: &str,
    ) -> Result<Self, AppError> {
        let row = sqlx::query!(
            r#"
            INSERT INTO instance_settings (instance_fqdn, instance_name)
            VALUES ($1, $2)
            RETURNING settings_id, instance_fqdn, registration_mode, invite_permission,
                      invite_limit, instance_name, instance_description, created_at, updated_at
            "#,
            instance_fqdn,
            format!("{} Voice Channel", instance_fqdn)
        )
        .fetch_one(pool)
        .await?;

        Ok(InstanceSettings {
            settings_id: row.settings_id,
            instance_fqdn: row.instance_fqdn,
            registration_mode: row.registration_mode,
            invite_permission: row.invite_permission,
            invite_limit: row.invite_limit,
            instance_name: row.instance_name,
            instance_description: row.instance_description,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }

    /// Update instance settings
    pub async fn update(
        pool: &PgPool,
        instance_fqdn: &str,
        updates: UpdateInstanceSettingsRequest,
    ) -> Result<Self, AppError> {
        let row = sqlx::query!(
            r#"
            UPDATE instance_settings 
            SET registration_mode = COALESCE($2, registration_mode),
                invite_permission = COALESCE($3, invite_permission),
                invite_limit = COALESCE($4, invite_limit),
                instance_name = COALESCE($5, instance_name),
                instance_description = COALESCE($6, instance_description)
            WHERE instance_fqdn = $1
            RETURNING settings_id, instance_fqdn, registration_mode, invite_permission,
                      invite_limit, instance_name, instance_description, created_at, updated_at
            "#,
            instance_fqdn,
            updates.registration_mode,
            updates.invite_permission,
            updates.invite_limit,
            updates.instance_name,
            updates.instance_description.unwrap_or(None),
        )
        .fetch_one(pool)
        .await?;

        Ok(InstanceSettings {
            settings_id: row.settings_id,
            instance_fqdn: row.instance_fqdn,
            registration_mode: row.registration_mode,
            invite_permission: row.invite_permission,
            invite_limit: row.invite_limit,
            instance_name: row.instance_name,
            instance_description: row.instance_description,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }

    /// Check if user can create invitations
    pub async fn can_user_create_invitation(
        pool: &PgPool,
        user_id: Uuid,
        instance_fqdn: &str,
    ) -> Result<bool, AppError> {
        let result = sqlx::query_scalar!(
            "SELECT can_user_create_invitation($1, $2)",
            user_id,
            instance_fqdn
        )
        .fetch_one(pool)
        .await?;

        Ok(result.unwrap_or(false))
    }
} 