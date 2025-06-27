use poem_openapi::{param::Path, payload::Json, OpenApi, Tags};
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    models::{
        group::{Group, GroupMembership, GroupWithMembership, CreateGroupRequest, UpdateGroupRequest, JoinGroupRequest},
        user_permissions::{UserPermissions, UpdateUserPermissionsRequest},
        channel::{Channel, CreateChannelRequest},
        user::User,
    },
    AppState,
};

pub struct GroupsApi {
    pub state: Arc<AppState>,
}

#[derive(Tags)]
enum GroupTags {
    /// Group management
    Groups,
    /// User permissions
    Permissions,
}

#[OpenApi]
impl GroupsApi {
    /// List all groups for current instance
    #[oai(path = "/groups", method = "get", tag = "GroupTags::Groups")]
    async fn list_groups(&self) -> poem_openapi::payload::Json<Vec<Group>> {
        match Group::list_all(&self.state.db.pool, &self.state.config.instance_fqdn).await {
            Ok(groups) => poem_openapi::payload::Json(groups),
            Err(_) => poem_openapi::payload::Json(vec![]),
        }
    }

    /// List public groups for current instance
    #[oai(path = "/groups/public", method = "get", tag = "GroupTags::Groups")]
    async fn list_public_groups(&self) -> poem_openapi::payload::Json<Vec<Group>> {
        match Group::list_public(&self.state.db.pool, &self.state.config.instance_fqdn).await {
            Ok(groups) => poem_openapi::payload::Json(groups),
            Err(_) => poem_openapi::payload::Json(vec![]),
        }
    }

    /// Create a new group
    #[oai(path = "/groups", method = "post", tag = "GroupTags::Groups")]
    async fn create_group(
        &self,
        request: Json<CreateGroupRequest>,
        creator_id: poem_openapi::param::Query<String>,
    ) -> Result<poem_openapi::payload::Json<Group>, poem::Error> {
        let creator_uuid = Uuid::parse_str(&creator_id.0)
            .map_err(|_| poem::Error::from_string("Invalid creator ID".to_string(), poem::http::StatusCode::BAD_REQUEST))?;

        // Check if user can create groups
        let can_create = UserPermissions::can_create_groups(&self.state.db.pool, creator_uuid, &self.state.config.instance_fqdn).await
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        if !can_create {
            return Err(poem::Error::from_string("Permission denied".to_string(), poem::http::StatusCode::FORBIDDEN));
        }

        match Group::create(&self.state.db.pool, request.0, self.state.config.instance_fqdn.clone(), creator_uuid).await {
            Ok(group) => Ok(poem_openapi::payload::Json(group)),
            Err(e) => Err(poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR)),
        }
    }

    /// Get a specific group by name
    #[oai(path = "/groups/name/:name", method = "get", tag = "GroupTags::Groups")]
    async fn get_group_by_name(&self, name: Path<String>) -> poem_openapi::payload::Json<Option<Group>> {
        match Group::find_by_name(&self.state.db.pool, &name, &self.state.config.instance_fqdn).await {
            Ok(group) => poem_openapi::payload::Json(group),
            Err(_) => poem_openapi::payload::Json(None),
        }
    }

    /// Update a group
    #[oai(path = "/groups/:group_id", method = "put", tag = "GroupTags::Groups")]
    async fn update_group(
        &self,
        group_id: Path<Uuid>,
        request: Json<UpdateGroupRequest>,
        user_id: poem_openapi::param::Query<String>,
    ) -> Result<poem_openapi::payload::Json<Group>, poem::Error> {
        let user_uuid = Uuid::parse_str(&user_id.0)
            .map_err(|_| poem::Error::from_string("Invalid user ID".to_string(), poem::http::StatusCode::BAD_REQUEST))?;

        // Check if user is admin of the group
        let is_admin = GroupMembership::is_admin(&self.state.db.pool, *group_id, user_uuid).await
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        if !is_admin {
            return Err(poem::Error::from_string("Permission denied".to_string(), poem::http::StatusCode::FORBIDDEN));
        }

        match Group::update(&self.state.db.pool, *group_id, request.0).await {
            Ok(group) => Ok(poem_openapi::payload::Json(group)),
            Err(e) => Err(poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR)),
        }
    }

    /// Join a group
    #[oai(path = "/groups/:group_id/join", method = "post", tag = "GroupTags::Groups")]
    async fn join_group(
        &self,
        group_id: Path<Uuid>,
        request: Json<JoinGroupRequest>,
    ) -> Result<poem_openapi::payload::Json<GroupMembership>, poem::Error> {
        // Check if user can join the group
        let can_join = sqlx::query_scalar!(
            "SELECT can_user_join_group($1, $2)",
            request.user_id,
            *group_id
        )
        .fetch_one(&self.state.db.pool)
        .await
        .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        if !can_join.unwrap_or(false) {
            return Err(poem::Error::from_string("Cannot join this group".to_string(), poem::http::StatusCode::FORBIDDEN));
        }

        match GroupMembership::join_group(&self.state.db.pool, *group_id, request.user_id).await {
            Ok(membership) => Ok(poem_openapi::payload::Json(membership)),
            Err(e) => Err(poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR)),
        }
    }

    /// Leave a group
    #[oai(path = "/groups/:group_id/leave", method = "post", tag = "GroupTags::Groups")]
    async fn leave_group(
        &self,
        group_id: Path<Uuid>,
        user_id: poem_openapi::param::Query<String>,
    ) -> Result<poem_openapi::payload::Json<serde_json::Value>, poem::Error> {
        let user_uuid = Uuid::parse_str(&user_id.0)
            .map_err(|_| poem::Error::from_string("Invalid user ID".to_string(), poem::http::StatusCode::BAD_REQUEST))?;

        match GroupMembership::leave_group(&self.state.db.pool, *group_id, user_uuid).await {
            Ok(_) => Ok(poem_openapi::payload::Json(serde_json::json!({"success": true}))),
            Err(e) => Err(poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR)),
        }
    }

    /// Get group members
    #[oai(path = "/groups/:group_id/members", method = "get", tag = "GroupTags::Groups")]
    async fn get_group_members(
        &self,
        group_id: Path<Uuid>,
    ) -> poem_openapi::payload::Json<Vec<User>> {
        match GroupMembership::get_group_members(&self.state.db.pool, *group_id).await {
            Ok(users) => poem_openapi::payload::Json(users),
            Err(_) => poem_openapi::payload::Json(vec![]),
        }
    }

    /// Get channels in a group
    #[oai(path = "/groups/:group_id/channels", method = "get", tag = "GroupTags::Groups")]
    async fn get_group_channels(
        &self,
        group_id: Path<Uuid>,
    ) -> poem_openapi::payload::Json<Vec<Channel>> {
        match Channel::find_by_group(&self.state.db.pool, *group_id).await {
            Ok(channels) => poem_openapi::payload::Json(channels),
            Err(_) => poem_openapi::payload::Json(vec![]),
        }
    }

    /// Create a channel in a group
    #[oai(path = "/groups/:group_id/channels", method = "post", tag = "GroupTags::Groups")]
    async fn create_channel_in_group(
        &self,
        group_id: Path<Uuid>,
        mut request: Json<CreateChannelRequest>,
        creator_id: poem_openapi::param::Query<String>,
    ) -> Result<poem_openapi::payload::Json<Channel>, poem::Error> {
        let creator_uuid = Uuid::parse_str(&creator_id.0)
            .map_err(|_| poem::Error::from_string("Invalid creator ID".to_string(), poem::http::StatusCode::BAD_REQUEST))?;

        // Set the group_id in the request
        request.group_id = *group_id;

        // Check if user can create channels in this group
        let can_create = sqlx::query_scalar!(
            "SELECT can_user_create_channel_in_group($1, $2)",
            creator_uuid,
            *group_id
        )
        .fetch_one(&self.state.db.pool)
        .await
        .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        if !can_create.unwrap_or(false) {
            return Err(poem::Error::from_string("Permission denied".to_string(), poem::http::StatusCode::FORBIDDEN));
        }

        match Channel::create(&self.state.db.pool, request.0, self.state.config.instance_fqdn.clone()).await {
            Ok(channel) => Ok(poem_openapi::payload::Json(channel)),
            Err(e) => Err(poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR)),
        }
    }

    /// Get user's groups
    #[oai(path = "/users/:user_id/groups", method = "get", tag = "GroupTags::Groups")]
    async fn get_user_groups(
        &self,
        user_id: Path<Uuid>,
    ) -> poem_openapi::payload::Json<Vec<GroupWithMembership>> {
        match Group::get_user_groups(&self.state.db.pool, *user_id, &self.state.config.instance_fqdn).await {
            Ok(groups) => poem_openapi::payload::Json(groups),
            Err(_) => poem_openapi::payload::Json(vec![]),
        }
    }

    // Permission management endpoints

    /// Get user permissions
    #[oai(path = "/users/:user_id/permissions", method = "get", tag = "GroupTags::Permissions")]
    async fn get_user_permissions(
        &self,
        user_id: Path<Uuid>,
    ) -> poem_openapi::payload::Json<Option<UserPermissions>> {
        match UserPermissions::find_by_user(&self.state.db.pool, *user_id, &self.state.config.instance_fqdn).await {
            Ok(permissions) => poem_openapi::payload::Json(permissions),
            Err(_) => poem_openapi::payload::Json(None),
        }
    }

    /// Update user permissions (admin only)
    #[oai(path = "/users/:user_id/permissions", method = "put", tag = "GroupTags::Permissions")]
    async fn update_user_permissions(
        &self,
        user_id: Path<Uuid>,
        request: Json<UpdateUserPermissionsRequest>,
        admin_id: poem_openapi::param::Query<String>,
    ) -> Result<poem_openapi::payload::Json<UserPermissions>, poem::Error> {
        let admin_uuid = Uuid::parse_str(&admin_id.0)
            .map_err(|_| poem::Error::from_string("Invalid admin ID".to_string(), poem::http::StatusCode::BAD_REQUEST))?;

        // Check if requester is admin
        let admin = User::find_by_id(&self.state.db.pool, admin_uuid).await
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        let admin = admin.ok_or_else(|| poem::Error::from_string("Admin not found".to_string(), poem::http::StatusCode::NOT_FOUND))?;

        if !admin.is_admin || admin.instance_fqdn != self.state.config.instance_fqdn {
            return Err(poem::Error::from_string("Permission denied".to_string(), poem::http::StatusCode::FORBIDDEN));
        }

        // Ensure user permissions exist
        UserPermissions::create_or_get(&self.state.db.pool, *user_id, self.state.config.instance_fqdn.clone()).await
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        match UserPermissions::update(&self.state.db.pool, *user_id, &self.state.config.instance_fqdn, request.0).await {
            Ok(permissions) => Ok(poem_openapi::payload::Json(permissions)),
            Err(e) => Err(poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR)),
        }
    }

    /// List all users with their permissions (admin only)
    #[oai(path = "/admin/users-permissions", method = "get", tag = "GroupTags::Permissions")]
    async fn list_users_with_permissions(
        &self,
        admin_id: poem_openapi::param::Query<String>,
    ) -> Result<poem_openapi::payload::Json<serde_json::Value>, poem::Error> {
        let admin_uuid = Uuid::parse_str(&admin_id.0)
            .map_err(|_| poem::Error::from_string("Invalid admin ID".to_string(), poem::http::StatusCode::BAD_REQUEST))?;

        // Check if requester is admin
        let admin = User::find_by_id(&self.state.db.pool, admin_uuid).await
            .map_err(|e| poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR))?;

        let admin = admin.ok_or_else(|| poem::Error::from_string("Admin not found".to_string(), poem::http::StatusCode::NOT_FOUND))?;

        if !admin.is_admin || admin.instance_fqdn != self.state.config.instance_fqdn {
            return Err(poem::Error::from_string("Permission denied".to_string(), poem::http::StatusCode::FORBIDDEN));
        }

        match UserPermissions::list_users_with_permissions(&self.state.db.pool, &self.state.config.instance_fqdn).await {
            Ok(users_permissions) => Ok(poem_openapi::payload::Json(serde_json::to_value(users_permissions).unwrap())),
            Err(e) => Err(poem::Error::from_string(e.to_string(), poem::http::StatusCode::INTERNAL_SERVER_ERROR)),
        }
    }
} 