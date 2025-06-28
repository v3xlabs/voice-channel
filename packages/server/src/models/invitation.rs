use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use poem_openapi::Object;
use rand::Rng;

use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize, Object)]
pub struct Invitation {
    pub invitation_id: Uuid,
    pub invite_code: String,
    pub created_by: Uuid,
    pub invited_by: Option<Uuid>,
    pub invited_email: Option<String>,
    pub instance_fqdn: String,
    pub max_uses: Option<i32>,
    pub current_uses: i32,
    pub is_active: bool,
    pub expires_at: Option<DateTime<Utc>>,
    pub used_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Object)]
pub struct CreateInvitationRequest {
    pub max_uses: Option<i32>,
    pub expires_at: Option<DateTime<Utc>>,
    pub invited_email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Object)]
pub struct InvitationUse {
    pub id: Uuid,
    pub invitation_id: Uuid,
    pub used_by: Uuid,
    pub used_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Object)]
pub struct InvitationWithCreator {
    #[serde(flatten)]
    pub invitation: Invitation,
    pub creator_username: String,
    pub creator_display_name: String,
}

impl Invitation {
    /// Generate a random invite code
    fn generate_invite_code() -> String {
        const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let mut rng = rand::thread_rng();
        
        (0..8)
            .map(|_| {
                let idx = rng.gen_range(0..CHARSET.len());
                CHARSET[idx] as char
            })
            .collect()
    }

    /// Create a new invitation
    pub async fn create(
        pool: &PgPool,
        created_by: Uuid,
        instance_fqdn: String,
        request: CreateInvitationRequest,
    ) -> Result<Self, AppError> {
        let invite_code = Self::generate_invite_code();
        let max_uses = request.max_uses.unwrap_or(1);

        let row = sqlx::query!(
            r#"
            INSERT INTO invitations (instance_fqdn, invite_code, created_by, invited_email, max_uses, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING invitation_id, invite_code, created_by, invited_by, invited_email, instance_fqdn, 
                      max_uses, current_uses, is_active, expires_at, used_at, created_at, updated_at
            "#,
            instance_fqdn,
            invite_code,
            created_by,
            request.invited_email,
            max_uses,
            request.expires_at
        )
        .fetch_one(pool)
        .await?;

        Ok(Invitation {
            invitation_id: row.invitation_id,
            invite_code: row.invite_code,
            created_by: row.created_by,
            invited_by: row.invited_by,
            invited_email: row.invited_email,
            instance_fqdn: row.instance_fqdn,
            max_uses: row.max_uses,
            current_uses: row.current_uses,
            is_active: row.is_active,
            expires_at: row.expires_at,
            used_at: row.used_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }

    /// Get invitation by code
    pub async fn get_by_code(
        pool: &PgPool,
        invite_code: &str,
    ) -> Result<Option<Self>, AppError> {
        let row = sqlx::query!(
            r#"
            SELECT invitation_id, instance_fqdn, invite_code, created_by, invited_by, invited_email, 
                   max_uses, current_uses, expires_at, is_active, created_at, used_at, updated_at
            FROM invitations 
            WHERE invite_code = $1
            "#,
            invite_code
        )
        .fetch_optional(pool)
        .await?;

        if let Some(row) = row {
            Ok(Some(Invitation {
                invitation_id: row.invitation_id,
                invite_code: row.invite_code,
                created_by: row.created_by,
                invited_by: row.invited_by,
                invited_email: row.invited_email,
                instance_fqdn: row.instance_fqdn,
                max_uses: row.max_uses,
                current_uses: row.current_uses,
                is_active: row.is_active,
                expires_at: row.expires_at,
                used_at: row.used_at,
                created_at: row.created_at,
                updated_at: row.updated_at,
            }))
        } else {
            Ok(None)
        }
    }

    /// Get invitations created by user
    pub async fn get_by_creator(
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Vec<Self>, AppError> {
        let rows = sqlx::query!(
            r#"
            SELECT invitation_id, instance_fqdn, invite_code, created_by, invited_by, invited_email, 
                   max_uses, current_uses, expires_at, is_active, created_at, used_at, updated_at
            FROM invitations 
            WHERE created_by = $1
            ORDER BY created_at DESC
            "#,
            user_id
        )
        .fetch_all(pool)
        .await?;

        let invitations = rows
            .into_iter()
            .map(|row| Invitation {
                invitation_id: row.invitation_id,
                invite_code: row.invite_code,
                created_by: row.created_by,
                invited_by: row.invited_by,
                invited_email: row.invited_email,
                instance_fqdn: row.instance_fqdn,
                max_uses: row.max_uses,
                current_uses: row.current_uses,
                is_active: row.is_active,
                expires_at: row.expires_at,
                used_at: row.used_at,
                created_at: row.created_at,
                updated_at: row.updated_at,
            })
            .collect();

        Ok(invitations)
    }

    /// Get all invitations for an instance (admin only)
    pub async fn get_by_instance(
        pool: &PgPool,
        instance_fqdn: &str,
    ) -> Result<Vec<Self>, AppError> {
        let rows = sqlx::query!(
            r#"
            SELECT i.invitation_id, i.instance_fqdn, i.invite_code, i.created_by, i.invited_by, i.invited_email, 
                   i.max_uses, i.current_uses, i.expires_at, i.is_active, i.created_at, i.used_at, i.updated_at
            FROM invitations i
            WHERE i.instance_fqdn = $1
            ORDER BY i.created_at DESC
            "#,
            instance_fqdn
        )
        .fetch_all(pool)
        .await?;

        let invitations = rows
            .into_iter()
            .map(|row| Invitation {
                invitation_id: row.invitation_id,
                invite_code: row.invite_code,
                created_by: row.created_by,
                invited_by: row.invited_by,
                invited_email: row.invited_email,
                instance_fqdn: row.instance_fqdn,
                max_uses: row.max_uses,
                current_uses: row.current_uses,
                is_active: row.is_active,
                expires_at: row.expires_at,
                used_at: row.used_at,
                created_at: row.created_at,
                updated_at: row.updated_at,
            })
            .collect();

        Ok(invitations)
    }

    /// Get all invitations for an instance with creator info (admin only)
    pub async fn get_by_instance_with_creator(
        pool: &PgPool,
        instance_fqdn: &str,
    ) -> Result<Vec<InvitationWithCreator>, AppError> {
        let rows = sqlx::query!(
            r#"
            SELECT i.invitation_id, i.instance_fqdn, i.invite_code, i.created_by, i.invited_by, i.invited_email, 
                   i.max_uses, i.current_uses, i.expires_at, i.is_active, i.created_at, i.used_at, i.updated_at,
                   u.username as creator_username, u.display_name as creator_display_name
            FROM invitations i
            LEFT JOIN users u ON i.created_by = u.user_id
            WHERE i.instance_fqdn = $1
            ORDER BY i.created_at DESC
            "#,
            instance_fqdn
        )
        .fetch_all(pool)
        .await?;

        let invitations = rows
            .into_iter()
            .map(|row| InvitationWithCreator {
                invitation: Invitation {
                    invitation_id: row.invitation_id,
                    invite_code: row.invite_code,
                    created_by: row.created_by,
                    invited_by: row.invited_by,
                    invited_email: row.invited_email,
                    instance_fqdn: row.instance_fqdn,
                    max_uses: row.max_uses,
                    current_uses: row.current_uses,
                    is_active: row.is_active,
                    expires_at: row.expires_at,
                    used_at: row.used_at,
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                },
                creator_username: row.creator_username,
                creator_display_name: row.creator_display_name,
            })
            .collect();

        Ok(invitations)
    }

    /// Check if invitation is valid and can be used
    pub fn is_valid(&self) -> bool {
        if !self.is_active {
            return false;
        }

        if let Some(expires_at) = self.expires_at {
            if expires_at < Utc::now() {
                return false;
            }
        }

        if let Some(max_uses) = self.max_uses {
            if self.current_uses >= max_uses {
                return false;
            }
        }

        true
    }

    /// Use an invitation (called during user registration)
    pub async fn use_invitation(
        pool: &PgPool,
        invite_code: &str,
        used_by: Uuid,
    ) -> Result<Self, AppError> {
        // Get invitation
        let invitation = sqlx::query!(
            r#"
            SELECT invitation_id, instance_fqdn, invite_code, created_by, invited_by, invited_email, 
                   max_uses, current_uses, expires_at, is_active, created_at, used_at, updated_at
            FROM invitations 
            WHERE invite_code = $1
            "#,
            invite_code
        )
        .fetch_one(pool)
        .await?;

        let invitation = Invitation {
            invitation_id: invitation.invitation_id,
            invite_code: invitation.invite_code,
            created_by: invitation.created_by,
            invited_by: invitation.invited_by,
            invited_email: invitation.invited_email,
            instance_fqdn: invitation.instance_fqdn,
            max_uses: invitation.max_uses,
            current_uses: invitation.current_uses,
            is_active: invitation.is_active,
            expires_at: invitation.expires_at,
            used_at: invitation.used_at,
            created_at: invitation.created_at,
            updated_at: invitation.updated_at,
        };

        if !invitation.is_valid() {
            return Err(AppError::BadRequest("Invalid invitation".to_string()));
        }

        // Check if already used by this user
        let already_used = sqlx::query_scalar!(
            "SELECT EXISTS(SELECT 1 FROM invitation_uses WHERE invitation_id = $1 AND used_by = $2)",
            invitation.invitation_id,
            used_by
        )
        .fetch_one(pool)
        .await?;

        if already_used.unwrap_or(false) {
            return Err(AppError::BadRequest("Invitation already used".to_string()));
        }

        // Record usage
        sqlx::query!(
            "INSERT INTO invitation_uses (invitation_id, used_by) VALUES ($1, $2)",
            invitation.invitation_id,
            used_by
        )
        .execute(pool)
        .await?;

        // Update invitation count
        let updated_row = sqlx::query!(
            r#"
            UPDATE invitations 
            SET current_uses = current_uses + 1,
                used_at = NOW()
            WHERE invitation_id = $1
            RETURNING invitation_id, instance_fqdn, invite_code, created_by, invited_by, invited_email,
                      max_uses, current_uses, expires_at, is_active, created_at, used_at, updated_at
            "#,
            invitation.invitation_id
        )
        .fetch_one(pool)
        .await?;

        Ok(Invitation {
            invitation_id: updated_row.invitation_id,
            invite_code: updated_row.invite_code,
            created_by: updated_row.created_by,
            invited_by: updated_row.invited_by,
            invited_email: updated_row.invited_email,
            instance_fqdn: updated_row.instance_fqdn,
            max_uses: updated_row.max_uses,
            current_uses: updated_row.current_uses,
            is_active: updated_row.is_active,
            expires_at: updated_row.expires_at,
            used_at: updated_row.used_at,
            created_at: updated_row.created_at,
            updated_at: updated_row.updated_at,
        })
    }

    /// Deactivate an invitation
    pub async fn deactivate(
        pool: &PgPool,
        invitation_id: Uuid,
    ) -> Result<bool, AppError> {
        let result = sqlx::query!(
            "UPDATE invitations SET is_active = false WHERE invitation_id = $1",
            invitation_id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Delete an invitation
    pub async fn delete(
        pool: &PgPool,
        invitation_id: Uuid,
    ) -> Result<bool, AppError> {
        let result = sqlx::query!(
            "DELETE FROM invitations WHERE invitation_id = $1",
            invitation_id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }
} 