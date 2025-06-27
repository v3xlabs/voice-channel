use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use poem_openapi::Object;
use rand::Rng;

#[derive(Debug, Clone, Serialize, Deserialize, Object)]
pub struct Invitation {
    pub id: Uuid,
    pub instance_fqdn: String,
    pub invite_code: String,
    pub invited_by: Uuid,
    pub invited_email: Option<String>,
    pub max_uses: i32,
    pub current_uses: i32,
    pub expires_at: Option<DateTime<Utc>>,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub used_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Object)]
pub struct CreateInvitation {
    pub invited_email: Option<String>,
    pub max_uses: Option<i32>,
    pub expires_at: Option<DateTime<Utc>>,
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
        instance_fqdn: &str,
        invited_by: Uuid,
        request: CreateInvitation,
    ) -> Result<Self, sqlx::Error> {
        let invite_code = Self::generate_invite_code();
        let max_uses = request.max_uses.unwrap_or(1);

        let row = sqlx::query!(
            r#"
            INSERT INTO invitations (instance_fqdn, invite_code, invited_by, invited_email, max_uses, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, instance_fqdn, invite_code, invited_by, invited_email, 
                      max_uses, current_uses, expires_at, is_active, created_at, used_at
            "#,
            instance_fqdn,
            invite_code,
            invited_by,
            request.invited_email,
            max_uses,
            request.expires_at
        )
        .fetch_one(pool)
        .await?;

        Ok(Self {
            id: row.id,
            instance_fqdn: row.instance_fqdn,
            invite_code: row.invite_code,
            invited_by: row.invited_by,
            invited_email: row.invited_email,
            max_uses: row.max_uses,
            current_uses: row.current_uses,
            expires_at: row.expires_at,
            is_active: row.is_active,
            created_at: row.created_at,
            used_at: row.used_at,
        })
    }

    /// Find invitation by code
    pub async fn find_by_code(pool: &PgPool, invite_code: &str) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query!(
            r#"
            SELECT id, instance_fqdn, invite_code, invited_by, invited_email, 
                   max_uses, current_uses, expires_at, is_active, created_at, used_at
            FROM invitations 
            WHERE invite_code = $1
            "#,
            invite_code
        )
        .fetch_optional(pool)
        .await?;

        if let Some(row) = row {
            Ok(Some(Self {
                id: row.id,
                instance_fqdn: row.instance_fqdn,
                invite_code: row.invite_code,
                invited_by: row.invited_by,
                invited_email: row.invited_email,
                max_uses: row.max_uses,
                current_uses: row.current_uses,
                expires_at: row.expires_at,
                is_active: row.is_active,
                created_at: row.created_at,
                used_at: row.used_at,
            }))
        } else {
            Ok(None)
        }
    }

    /// Get invitations created by a user
    pub async fn get_by_creator(pool: &PgPool, user_id: Uuid) -> Result<Vec<Self>, sqlx::Error> {
        let rows = sqlx::query!(
            r#"
            SELECT id, instance_fqdn, invite_code, invited_by, invited_email, 
                   max_uses, current_uses, expires_at, is_active, created_at, used_at
            FROM invitations 
            WHERE invited_by = $1
            ORDER BY created_at DESC
            "#,
            user_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(|row| Self {
            id: row.id,
            instance_fqdn: row.instance_fqdn,
            invite_code: row.invite_code,
            invited_by: row.invited_by,
            invited_email: row.invited_email,
            max_uses: row.max_uses,
            current_uses: row.current_uses,
            expires_at: row.expires_at,
            is_active: row.is_active,
            created_at: row.created_at,
            used_at: row.used_at,
        }).collect())
    }

    /// Get all invitations for an instance (admin only)
    pub async fn get_for_instance(pool: &PgPool, instance_fqdn: &str) -> Result<Vec<InvitationWithCreator>, sqlx::Error> {
        let rows = sqlx::query!(
            r#"
            SELECT i.id, i.instance_fqdn, i.invite_code, i.invited_by, i.invited_email, 
                   i.max_uses, i.current_uses, i.expires_at, i.is_active, i.created_at, i.used_at,
                   u.username as creator_username, u.display_name as creator_display_name
            FROM invitations i
            JOIN users u ON i.invited_by = u.id
            WHERE i.instance_fqdn = $1
            ORDER BY i.created_at DESC
            "#,
            instance_fqdn
        )
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(|row| InvitationWithCreator {
            invitation: Invitation {
                id: row.id,
                instance_fqdn: row.instance_fqdn,
                invite_code: row.invite_code,
                invited_by: row.invited_by,
                invited_email: row.invited_email,
                max_uses: row.max_uses,
                current_uses: row.current_uses,
                expires_at: row.expires_at,
                is_active: row.is_active,
                created_at: row.created_at,
                used_at: row.used_at,
            },
            creator_username: row.creator_username,
            creator_display_name: row.creator_display_name,
        }).collect())
    }

    /// Check if invitation is valid and can be used
    pub fn is_valid(&self) -> bool {
        if !self.is_active {
            return false;
        }

        if self.current_uses >= self.max_uses {
            return false;
        }

        if let Some(expires_at) = self.expires_at {
            if Utc::now() > expires_at {
                return false;
            }
        }

        true
    }

    /// Use an invitation (increment usage count)
    pub async fn use_invitation(
        pool: &PgPool,
        invite_code: &str,
        used_by: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        let mut tx = pool.begin().await?;

        // Check if invitation exists and is valid
        let invitation = sqlx::query!(
            r#"
            SELECT id, instance_fqdn, invite_code, invited_by, invited_email, 
                   max_uses, current_uses, expires_at, is_active, created_at, used_at
            FROM invitations 
            WHERE invite_code = $1 AND is_active = true
            FOR UPDATE
            "#,
            invite_code
        )
        .fetch_optional(&mut *tx)
        .await?;

        let Some(inv_row) = invitation else {
            tx.rollback().await?;
            return Ok(None);
        };

        let invitation = Self {
            id: inv_row.id,
            instance_fqdn: inv_row.instance_fqdn,
            invite_code: inv_row.invite_code,
            invited_by: inv_row.invited_by,
            invited_email: inv_row.invited_email,
            max_uses: inv_row.max_uses,
            current_uses: inv_row.current_uses,
            expires_at: inv_row.expires_at,
            is_active: inv_row.is_active,
            created_at: inv_row.created_at,
            used_at: inv_row.used_at,
        };

        if !invitation.is_valid() {
            tx.rollback().await?;
            return Ok(None);
        }

        // Check if user already used this invitation
        let already_used = sqlx::query_scalar!(
            "SELECT EXISTS(SELECT 1 FROM invitation_uses WHERE invitation_id = $1 AND used_by = $2)",
            invitation.id,
            used_by
        )
        .fetch_one(&mut *tx)
        .await?;

        if already_used.unwrap_or(false) {
            tx.rollback().await?;
            return Ok(None);
        }

        // Record the usage
        sqlx::query!(
            "INSERT INTO invitation_uses (invitation_id, used_by) VALUES ($1, $2)",
            invitation.id,
            used_by
        )
        .execute(&mut *tx)
        .await?;

        // Update invitation usage count
        let updated_row = sqlx::query!(
            r#"
            UPDATE invitations 
            SET current_uses = current_uses + 1,
                used_at = CASE WHEN used_at IS NULL THEN NOW() ELSE used_at END
            WHERE id = $1
            RETURNING id, instance_fqdn, invite_code, invited_by, invited_email, 
                      max_uses, current_uses, expires_at, is_active, created_at, used_at
            "#,
            invitation.id
        )
        .fetch_one(&mut *tx)
        .await?;

        tx.commit().await?;

        Ok(Some(Self {
            id: updated_row.id,
            instance_fqdn: updated_row.instance_fqdn,
            invite_code: updated_row.invite_code,
            invited_by: updated_row.invited_by,
            invited_email: updated_row.invited_email,
            max_uses: updated_row.max_uses,
            current_uses: updated_row.current_uses,
            expires_at: updated_row.expires_at,
            is_active: updated_row.is_active,
            created_at: updated_row.created_at,
            used_at: updated_row.used_at,
        }))
    }

    /// Deactivate an invitation
    pub async fn deactivate(pool: &PgPool, invitation_id: Uuid) -> Result<bool, sqlx::Error> {
        let result = sqlx::query!(
            "UPDATE invitations SET is_active = false WHERE id = $1",
            invitation_id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Delete an invitation
    pub async fn delete(pool: &PgPool, invitation_id: Uuid) -> Result<bool, sqlx::Error> {
        let result = sqlx::query!(
            "DELETE FROM invitations WHERE id = $1",
            invitation_id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }
} 