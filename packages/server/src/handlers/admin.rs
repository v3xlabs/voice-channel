use crate::{
    models::{
        instance_settings::{InstanceSettings, UpdateInstanceSettingsRequest},
        invitation::{Invitation, CreateInvitationRequest, InvitationWithCreator},
        user::User,
    },
    AppState,
};
use poem_openapi::{param::Path, param::Query, payload::Json, OpenApi, Tags};
use std::sync::Arc;
use uuid::Uuid;

#[derive(Tags)]
enum AdminApiTags {
    /// Instance administration endpoints
    Admin,
}

pub struct AdminApi {
    pub state: Arc<AppState>,
}

#[OpenApi]
impl AdminApi {
    /// Get instance settings
    #[oai(path = "/admin/settings", method = "get", tag = "AdminApiTags::Admin")]
    async fn get_instance_settings(
        &self,
    ) -> Result<Json<InstanceSettings>, poem::Error> {
        let settings = InstanceSettings::get_by_fqdn(&self.state.db.pool, &self.state.config.instance_fqdn)
            .await
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?
            .unwrap_or_else(|| {
                // For now, return a default - in production, create one in DB
                InstanceSettings {
                    settings_id: Uuid::new_v4(),
                    instance_fqdn: self.state.config.instance_fqdn.clone(),
                    registration_mode: "invite_only".to_string(),
                    invite_permission: "admin_only".to_string(),
                    invite_limit: None,
                    instance_name: format!("{} Voice Channel", self.state.config.instance_fqdn),
                    instance_description: None,
                    created_at: chrono::Utc::now(),
                    updated_at: chrono::Utc::now(),
                }
            });

        Ok(Json(settings))
    }

    /// Update instance settings (admin only)
    #[oai(path = "/admin/settings", method = "patch", tag = "AdminApiTags::Admin")]
    async fn update_instance_settings(
        &self,
        admin_user_id: Query<Uuid>, // In real implementation, this would come from auth middleware
        updates: Json<UpdateInstanceSettingsRequest>,
    ) -> Result<Json<InstanceSettings>, poem::Error> {
        // Verify user is admin
        let user = User::find_by_id(&self.state.db.pool, admin_user_id.0)
            .await
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?
            .ok_or_else(|| poem::Error::from_string("User not found", poem::http::StatusCode::NOT_FOUND))?;

        if !user.is_admin {
            return Err(poem::Error::from_string(
                "Admin access required",
                poem::http::StatusCode::FORBIDDEN,
            ));
        }

        if user.instance_fqdn != self.state.config.instance_fqdn {
            return Err(poem::Error::from_string(
                "Can only modify settings for your own instance",
                poem::http::StatusCode::FORBIDDEN,
            ));
        }

        let settings = InstanceSettings::update(&self.state.db.pool, &self.state.config.instance_fqdn, updates.0)
            .await
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        Ok(Json(settings))
    }

    /// Create an invitation
    #[oai(path = "/admin/invitations", method = "post", tag = "AdminApiTags::Admin")]
    async fn create_invitation(
        &self,
        user_id: Query<Uuid>, // In real implementation, this would come from auth middleware
        request: Json<CreateInvitationRequest>,
    ) -> Result<Json<Invitation>, poem::Error> {
        // Check if user can create invitations
        let can_invite = InstanceSettings::can_user_create_invitation(&self.state.db.pool, user_id.0, &self.state.config.instance_fqdn)
            .await
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        if !can_invite {
            return Err(poem::Error::from_string(
                "You don't have permission to create invitations",
                poem::http::StatusCode::FORBIDDEN,
            ));
        }

        let invitation = Invitation::create(&self.state.db.pool, user_id.0, self.state.config.instance_fqdn.clone(), request.0)
            .await
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        Ok(Json(invitation))
    }

    /// Get user's invitations
    #[oai(path = "/admin/invitations/my", method = "get", tag = "AdminApiTags::Admin")]
    async fn get_my_invitations(
        &self,
        user_id: Query<Uuid>,
    ) -> Result<Json<Vec<Invitation>>, poem::Error> {
        let invitations = Invitation::get_by_creator(&self.state.db.pool, user_id.0)
            .await
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        Ok(Json(invitations))
    }

    /// Get all invitations for instance (admin only)
    #[oai(path = "/admin/invitations", method = "get", tag = "AdminApiTags::Admin")]
    async fn get_instance_invitations(
        &self,
        admin_user_id: Query<Uuid>,
    ) -> Result<Json<Vec<InvitationWithCreator>>, poem::Error> {
        // Verify user is admin
        let user = User::find_by_id(&self.state.db.pool, admin_user_id.0)
            .await
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?
            .ok_or_else(|| poem::Error::from_string("User not found", poem::http::StatusCode::NOT_FOUND))?;

        if !user.is_admin || user.instance_fqdn != self.state.config.instance_fqdn {
            return Err(poem::Error::from_string(
                "Admin access required for this instance",
                poem::http::StatusCode::FORBIDDEN,
            ));
        }

        let invitations = Invitation::get_by_instance_with_creator(&self.state.db.pool, &self.state.config.instance_fqdn)
            .await
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        Ok(Json(invitations))
    }

    /// Deactivate an invitation
    #[oai(path = "/admin/invitations/{invitation_id}/deactivate", method = "post", tag = "AdminApiTags::Admin")]
    async fn deactivate_invitation(
        &self,
        invitation_id: Path<Uuid>,
    ) -> Result<Json<bool>, poem::Error> {
        // TODO: Get user_id from authentication middleware and verify the user owns this invitation or is admin
        let success = Invitation::deactivate(&self.state.db.pool, invitation_id.0)
            .await
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        Ok(Json(success))
    }

    /// Delete an invitation
    #[oai(path = "/admin/invitations/{invitation_id}", method = "delete", tag = "AdminApiTags::Admin")]
    async fn delete_invitation(
        &self,
        invitation_id: Path<Uuid>,
        _user_id: Query<Uuid>,
    ) -> Result<Json<bool>, poem::Error> {
        // In a real implementation, you'd verify the user owns this invitation or is admin
        let success = Invitation::delete(&self.state.db.pool, invitation_id.0)
            .await
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        Ok(Json(success))
    }

    /// Use an invitation to register
    #[oai(path = "/invitations/{invite_code}/use", method = "post", tag = "AdminApiTags::Admin")]
    async fn use_invitation(
        &self,
        invite_code: Path<String>,
        user_id: Query<Uuid>,
    ) -> Result<Json<Option<Invitation>>, poem::Error> {
        let invitation = Invitation::use_invitation(&self.state.db.pool, &invite_code, user_id.0)
            .await
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        Ok(Json(Some(invitation)))
    }

    /// Get invitation details by code (for registration page)
    #[oai(path = "/invitations/{invite_code}", method = "get", tag = "AdminApiTags::Admin")]
    async fn get_invitation_by_code(
        &self,
        invite_code: Path<String>,
    ) -> Result<Json<Option<Invitation>>, poem::Error> {
        let invitation = Invitation::get_by_code(&self.state.db.pool, &invite_code)
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

    /// Get all users for instance (admin only)
    #[oai(path = "/admin/users", method = "get", tag = "AdminApiTags::Admin")]
    async fn get_instance_users(
        &self,
        admin_user_id: Query<Uuid>,
    ) -> Result<Json<Vec<User>>, poem::Error> {
        // Verify user is admin
        let user = User::find_by_id(&self.state.db.pool, admin_user_id.0)
            .await
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?
            .ok_or_else(|| poem::Error::from_string("User not found", poem::http::StatusCode::NOT_FOUND))?;

        if !user.is_admin || user.instance_fqdn != self.state.config.instance_fqdn {
            return Err(poem::Error::from_string(
                "Admin access required for this instance",
                poem::http::StatusCode::FORBIDDEN,
            ));
        }

        let users = User::list_by_instance(&self.state.db.pool, &self.state.config.instance_fqdn)
            .await
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        Ok(Json(users))
    }
} 