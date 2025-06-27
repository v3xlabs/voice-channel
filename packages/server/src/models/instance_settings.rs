use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use poem_openapi::Object;

#[derive(Debug, Clone, Serialize, Deserialize, Object)]
pub struct InstanceSettings {
    pub id: Uuid,
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

#[derive(Debug, Clone, Serialize, Deserialize, Object)]
pub struct UpdateInstanceSettings {
    pub registration_mode: Option<String>,
    pub invite_permission: Option<String>,
    pub invite_limit: Option<Option<i32>>, // Option<Option<i32>> to allow setting to NULL
    pub instance_name: Option<String>,
    pub instance_description: Option<Option<String>>,
}

impl InstanceSettings {
    /// Get instance settings by FQDN
    pub async fn get_by_fqdn(pool: &PgPool, instance_fqdn: &str) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query!(
            r#"
            SELECT id, instance_fqdn, registration_mode, invite_permission, 
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
                    Ok(Some(Self {
            id: row.id,
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

    /// Create or get default instance settings
    pub async fn get_or_create_default(pool: &PgPool, instance_fqdn: &str) -> Result<Self, sqlx::Error> {
        if let Some(settings) = Self::get_by_fqdn(pool, instance_fqdn).await? {
            return Ok(settings);
        }

        // Create default settings
        let row = sqlx::query!(
            r#"
            INSERT INTO instance_settings (instance_fqdn, instance_name)
            VALUES ($1, $2)
            RETURNING id, instance_fqdn, registration_mode, invite_permission, 
                      invite_limit, instance_name, instance_description, 
                      created_at, updated_at
            "#,
            instance_fqdn,
            format!("{} Voice Channel", instance_fqdn)
        )
        .fetch_one(pool)
        .await?;

        Ok(Self {
            id: row.id,
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

    /// Update instance settings (admin only)
    pub async fn update(
        pool: &PgPool,
        instance_fqdn: &str,
        updates: UpdateInstanceSettings,
    ) -> Result<Self, sqlx::Error> {
        let registration_mode_str = updates.registration_mode.as_ref();
        let invite_permission_str = updates.invite_permission.as_ref();

        let row = sqlx::query!(
            r#"
            UPDATE instance_settings 
            SET registration_mode = COALESCE($2, registration_mode),
                invite_permission = COALESCE($3, invite_permission),
                invite_limit = CASE WHEN $4::boolean THEN $5 ELSE invite_limit END,
                instance_name = COALESCE($6, instance_name),
                instance_description = CASE WHEN $7::boolean THEN $8 ELSE instance_description END,
                updated_at = NOW()
            WHERE instance_fqdn = $1
            RETURNING id, instance_fqdn, registration_mode, invite_permission, 
                      invite_limit, instance_name, instance_description, 
                      created_at, updated_at
            "#,
            instance_fqdn,
            registration_mode_str,
            invite_permission_str,
            updates.invite_limit.is_some(), // Boolean flag for invite_limit update
            updates.invite_limit.unwrap_or(None),
            updates.instance_name,
            updates.instance_description.is_some(), // Boolean flag for description update
            updates.instance_description.unwrap_or(None),
        )
        .fetch_one(pool)
        .await?;

        Ok(Self {
            id: row.id,
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

    /// Check if registration is open for this instance
    pub fn is_registration_open(&self) -> bool {
        self.registration_mode == "open"
    }

    /// Check if a user can create invitations
    pub async fn can_user_create_invitation(
        pool: &PgPool,
        user_id: Uuid,
        instance_fqdn: &str,
    ) -> Result<bool, sqlx::Error> {
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