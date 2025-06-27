use crate::models::{
    instance_settings::{InstanceSettings, UpdateInstanceSettings},
    invitation::{Invitation, CreateInvitation, InvitationWithCreator},
    user::User,
};
use poem::web::Data;
use poem_openapi::{param::Path, param::Query, payload::Json, OpenApi, Tags};
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Tags)]
enum AdminApiTags {
    /// Instance administration endpoints
    Admin,
}

pub struct AdminApi;

#[OpenApi]
impl AdminApi {
    /// Get instance settings
    #[oai(path = "/admin/settings", method = "get", tag = "AdminApiTags::Admin")]
    async fn get_instance_settings(
        &self,
        pool: Data<&PgPool>,
        instance_fqdn: Query<String>,
    ) -> Result<Json<InstanceSettings>, poem::Error> {
        let settings = InstanceSettings::get_or_create_default(&pool, &instance_fqdn)
            .await
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        Ok(Json(settings))
    }

    /// Update instance settings (admin only)
    #[oai(path = "/admin/settings", method = "patch", tag = "AdminApiTags::Admin")]
    async fn update_instance_settings(
        &self,
        pool: Data<&PgPool>,
        instance_fqdn: Query<String>,
        admin_user_id: Query<Uuid>, // In real implementation, this would come from auth middleware
        updates: Json<UpdateInstanceSettings>,
    ) -> Result<Json<InstanceSettings>, poem::Error> {
        // Verify user is admin
        let user = User::find_by_id(&pool, admin_user_id.0)
            .await
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?
            .ok_or_else(|| poem::Error::from_string("User not found", poem::http::StatusCode::NOT_FOUND))?;

        if !user.is_admin {
            return Err(poem::Error::from_string(
                "Admin access required",
                poem::http::StatusCode::FORBIDDEN,
            ));
        }

        if user.instance_fqdn != instance_fqdn.0 {
            return Err(poem::Error::from_string(
                "Can only modify settings for your own instance",
                poem::http::StatusCode::FORBIDDEN,
            ));
        }

        let settings = InstanceSettings::update(&pool, &instance_fqdn, updates.0)
            .await
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        Ok(Json(settings))
    }

    /// Create an invitation
    #[oai(path = "/admin/invitations", method = "post", tag = "AdminApiTags::Admin")]
    async fn create_invitation(
        &self,
        pool: Data<&PgPool>,
        instance_fqdn: Query<String>,
        user_id: Query<Uuid>, // In real implementation, this would come from auth middleware
        request: Json<CreateInvitation>,
    ) -> Result<Json<Invitation>, poem::Error> {
        // Check if user can create invitations
        let can_invite = InstanceSettings::can_user_create_invitation(&pool, user_id.0, &instance_fqdn)
            .await
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        if !can_invite {
            return Err(poem::Error::from_string(
                "You don't have permission to create invitations",
                poem::http::StatusCode::FORBIDDEN,
            ));
        }

        let invitation = Invitation::create(&pool, &instance_fqdn, user_id.0, request.0)
            .await
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        Ok(Json(invitation))
    }

    /// Get user's invitations
    #[oai(path = "/admin/invitations/my", method = "get", tag = "AdminApiTags::Admin")]
    async fn get_my_invitations(
        &self,
        pool: Data<&PgPool>,
        user_id: Query<Uuid>,
    ) -> Result<Json<Vec<Invitation>>, poem::Error> {
        let invitations = Invitation::get_by_creator(&pool, user_id.0)
            .await
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        Ok(Json(invitations))
    }

    /// Get all invitations for instance (admin only)
    #[oai(path = "/admin/invitations", method = "get", tag = "AdminApiTags::Admin")]
    async fn get_instance_invitations(
        &self,
        pool: Data<&PgPool>,
        instance_fqdn: Query<String>,
        admin_user_id: Query<Uuid>,
    ) -> Result<Json<Vec<InvitationWithCreator>>, poem::Error> {
        // Verify user is admin
        let user = User::find_by_id(&pool, admin_user_id.0)
            .await
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?
            .ok_or_else(|| poem::Error::from_string("User not found", poem::http::StatusCode::NOT_FOUND))?;

        if !user.is_admin || user.instance_fqdn != instance_fqdn.0 {
            return Err(poem::Error::from_string(
                "Admin access required for this instance",
                poem::http::StatusCode::FORBIDDEN,
            ));
        }

        let invitations = Invitation::get_for_instance(&pool, &instance_fqdn)
            .await
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        Ok(Json(invitations))
    }

    /// Deactivate an invitation
    #[oai(path = "/admin/invitations/{invitation_id}/deactivate", method = "post", tag = "AdminApiTags::Admin")]
    async fn deactivate_invitation(
        &self,
        pool: Data<&PgPool>,
        invitation_id: Path<Uuid>,
        user_id: Query<Uuid>,
    ) -> Result<Json<bool>, poem::Error> {
        // In a real implementation, you'd verify the user owns this invitation or is admin
        let success = Invitation::deactivate(&pool, invitation_id.0)
            .await
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        Ok(Json(success))
    }

    /// Delete an invitation
    #[oai(path = "/admin/invitations/{invitation_id}", method = "delete", tag = "AdminApiTags::Admin")]
    async fn delete_invitation(
        &self,
        pool: Data<&PgPool>,
        invitation_id: Path<Uuid>,
        user_id: Query<Uuid>,
    ) -> Result<Json<bool>, poem::Error> {
        // In a real implementation, you'd verify the user owns this invitation or is admin
        let success = Invitation::delete(&pool, invitation_id.0)
            .await
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        Ok(Json(success))
    }

    /// Use an invitation to register
    #[oai(path = "/invitations/{invite_code}/use", method = "post", tag = "AdminApiTags::Admin")]
    async fn use_invitation(
        &self,
        pool: Data<&PgPool>,
        invite_code: Path<String>,
        user_id: Query<Uuid>,
    ) -> Result<Json<Option<Invitation>>, poem::Error> {
        let invitation = Invitation::use_invitation(&pool, &invite_code, user_id.0)
            .await
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        Ok(Json(invitation))
    }

    /// Get invitation details by code (for registration page)
    #[oai(path = "/invitations/{invite_code}", method = "get", tag = "AdminApiTags::Admin")]
    async fn get_invitation_by_code(
        &self,
        pool: Data<&PgPool>,
        invite_code: Path<String>,
    ) -> Result<Json<Option<Invitation>>, poem::Error> {
        let invitation = Invitation::find_by_code(&pool, &invite_code)
            .await
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        // Only return if invitation is valid
        if let Some(inv) = invitation {
            if inv.is_valid() {
                Ok(Json(Some(inv)))
            } else {
                Ok(Json(None))
            }
        } else {
            Ok(Json(None))
        }
    }
} 