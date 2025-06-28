use poem_openapi::{payload::Json, OpenApi, Object};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AppError,
    handlers::api::ApiTags,
    models::{
        user::User,
        webauthn::{RegisterBeginRequest, RegisterFinishRequest},
        instance_settings::InstanceSettings,
    },
    services::webauthn::WebAuthnService,
};

#[derive(Debug, Serialize, Object)]
pub struct SetupStatusResponse {
    pub setup_required: bool,
    pub user_count: i64,
    pub message: String,
}

#[derive(Debug, Deserialize, Object)]
pub struct BootstrapRegisterBeginRequest {
    pub display_name: String,
    pub instance_name: Option<String>,
    pub instance_description: Option<String>,
}

#[derive(Debug, Serialize, Object)]
pub struct BootstrapRegisterBeginResponse {
    pub challenge_id: String,
    pub options: serde_json::Value,
}

#[derive(Debug, Deserialize, Object)]
pub struct BootstrapRegisterFinishRequest {
    pub challenge_id: String,
    pub credential: serde_json::Value,
    pub instance_name: Option<String>,
    pub instance_description: Option<String>,
}

#[derive(Debug, Serialize, Object)]
pub struct BootstrapRegisterFinishResponse {
    pub user_id: Uuid,
    pub success: bool,
    pub is_admin: bool,
    pub message: String,
}

pub struct SetupApi {
    pub pool: PgPool,
    pub webauthn: WebAuthnService,
    pub instance_fqdn: String,
}

#[OpenApi(tag = "ApiTags::Setup")]
impl SetupApi {
    /// Check if setup is required (zero users in database)
    #[oai(path = "/status", method = "get")]
    async fn setup_status(&self) -> Json<SetupStatusResponse> {
        let user_count = match sqlx::query_scalar!("SELECT COUNT(*) FROM users")
            .fetch_one(&self.pool)
            .await
        {
            Ok(count) => count.unwrap_or(0),
            Err(_) => 0,
        };

        if user_count == 0 {
            Json(SetupStatusResponse {
                setup_required: true,
                user_count,
                message: "No users found. Bootstrap setup is required.".to_string(),
            })
        } else {
            Json(SetupStatusResponse {
                setup_required: false,
                user_count,
                message: "Instance already configured.".to_string(),
            })
        }
    }

    /// Begin bootstrap registration (first user becomes admin)
    #[oai(path = "/register/begin", method = "post")]
    async fn bootstrap_register_begin(
        &self,
        request: Json<BootstrapRegisterBeginRequest>,
    ) -> Json<BootstrapRegisterBeginResponse> {
        // Check if setup is still required
        let user_count = match sqlx::query_scalar!("SELECT COUNT(*) FROM users")
            .fetch_one(&self.pool)
            .await
        {
            Ok(count) => count.unwrap_or(0),
            Err(_) => 0,
        };

        if user_count > 0 {
            return Json(BootstrapRegisterBeginResponse {
                challenge_id: "error".to_string(),
                options: serde_json::json!({"error": "Setup no longer available - users already exist"}),
            });
        }

        // Ensure instance settings exist
        let _settings = match InstanceSettings::get_by_fqdn(&self.pool, &self.instance_fqdn).await {
            Ok(Some(settings)) => settings,
            Ok(None) => {
                tracing::info!("Creating default instance settings for {}", self.instance_fqdn);
                match InstanceSettings::create_default(&self.pool, &self.instance_fqdn).await {
                    Ok(settings) => settings,
                    Err(_) => {
                        return Json(BootstrapRegisterBeginResponse {
                            challenge_id: "error".to_string(),
                            options: serde_json::json!({"error": "Failed to create instance settings"}),
                        });
                    }
                }
            }
            Err(_) => {
                return Json(BootstrapRegisterBeginResponse {
                    challenge_id: "error".to_string(),
                    options: serde_json::json!({"error": "Failed to access instance settings"}),
                });
            }
        };

        // Convert to standard WebAuthn registration request
        let webauthn_request = RegisterBeginRequest {
            display_name: request.display_name.clone(),
            invite_code: None, // Bootstrap doesn't need invite
        };

        match self.webauthn.register_begin(&self.pool, webauthn_request).await {
            Ok(response) => Json(BootstrapRegisterBeginResponse {
                challenge_id: response.challenge_id,
                options: response.options,
            }),
            Err(e) => Json(BootstrapRegisterBeginResponse {
                challenge_id: "error".to_string(),
                options: serde_json::json!({"error": format!("WebAuthn registration failed: {}", e)}),
            }),
        }
    }

    /// Finish bootstrap registration (creates admin user)
    #[oai(path = "/register/finish", method = "post")]
    async fn bootstrap_register_finish(
        &self,
        request: Json<BootstrapRegisterFinishRequest>,
    ) -> Json<BootstrapRegisterFinishResponse> {
        // Double-check setup is still required
        let user_count = match sqlx::query_scalar!("SELECT COUNT(*) FROM users")
            .fetch_one(&self.pool)
            .await
        {
            Ok(count) => count.unwrap_or(0),
            Err(_) => 0,
        };

        if user_count > 0 {
            return Json(BootstrapRegisterFinishResponse {
                user_id: uuid::Uuid::new_v4(),
                success: false,
                is_admin: false,
                message: "Setup no longer available - users already exist".to_string(),
            });
        }

        // Convert to standard WebAuthn registration request
        let webauthn_request = RegisterFinishRequest {
            challenge_id: request.challenge_id.clone(),
            credential: request.credential.clone(),
        };

        let response = match self.webauthn.register_finish(&self.pool, webauthn_request).await {
            Ok(resp) => resp,
            Err(e) => {
                return Json(BootstrapRegisterFinishResponse {
                    user_id: uuid::Uuid::new_v4(),
                    success: false,
                    is_admin: false,
                    message: format!("WebAuthn registration failed: {}", e),
                });
            }
        };

        // Elevate the first user to admin
        let admin_user = match User::update_admin_status(&self.pool, response.user_id, true).await {
            Ok(user) => user,
            Err(e) => {
                return Json(BootstrapRegisterFinishResponse {
                    user_id: response.user_id,
                    success: false,
                    is_admin: false,
                    message: format!("Failed to grant admin privileges: {}", e),
                });
            }
        };

        // Update instance settings if provided
        if let (Some(name), Some(desc)) = (&request.instance_name, &request.instance_description) {
            let update_request = crate::models::instance_settings::UpdateInstanceSettingsRequest {
                registration_mode: None,
                invite_permission: None,
                invite_limit: None,
                instance_name: Some(name.clone()),
                instance_description: Some(desc.clone()),
            };
            let _ = InstanceSettings::update(&self.pool, &self.instance_fqdn, update_request).await;
        }

        tracing::info!(
            "Bootstrap completed: Admin user {} ({}) created for instance {}",
            admin_user.username,
            admin_user.user_id,
            self.instance_fqdn
        );

        Json(BootstrapRegisterFinishResponse {
            user_id: response.user_id,
            success: true,
            is_admin: true,
            message: "Bootstrap completed successfully. You are now the administrator.".to_string(),
        })
    }
} 