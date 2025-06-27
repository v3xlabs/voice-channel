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
    ) -> Result<poem_openapi::payload::Json<Group>, poem_openapi::payload::PlainText<String>> {
        let creator_uuid = Uuid::parse_str(&creator_id.0)
            .map_err(|_| poem_openapi::payload::PlainText("Invalid creator ID".to_string()))?;

        // Check if user can create groups
        let can_create = UserPermissions::can_create_groups(&self.state.db.pool, creator_uuid, &self.state.config.instance_fqdn).await
            .map_err(|_| poem_openapi::payload::PlainText("Failed to check permissions".to_string()))?;

        if !can_create {
            return Err(poem_openapi::payload::PlainText("Permission denied".to_string()));
        }

        match Group::create(&self.state.db.pool, request.0, self.state.config.instance_fqdn.clone(), creator_uuid).await {
            Ok(group) => Ok(poem_openapi::payload::Json(group)),
            Err(_) => Err(poem_openapi::payload::PlainText("Failed to create group".to_string())),
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
    ) -> Result<poem_openapi::payload::Json<Group>, poem_openapi::payload::PlainText<String>> {
        let user_uuid = Uuid::parse_str(&user_id.0)
            .map_err(|_| poem_openapi::payload::PlainText("Invalid user ID".to_string()))?;

        // Check if user is admin of the group
        let is_admin = GroupMembership::is_admin(&self.state.db.pool, *group_id, user_uuid).await
            .map_err(|_| poem_openapi::payload::PlainText("Failed to check permissions".to_string()))?;

        if !is_admin {
            return Err(poem_openapi::payload::PlainText("Permission denied".to_string()));
        }

        match Group::update(&self.state.db.pool, *group_id, request.0).await {
            Ok(group) => Ok(poem_openapi::payload::Json(group)),
            Err(_) => Err(poem_openapi::payload::PlainText("Failed to update group".to_string())),
        }
    }

    /// Join a group
    #[oai(path = "/groups/:group_id/join", method = "post", tag = "GroupTags::Groups")]
    async fn join_group(
        &self,
        group_id: Path<Uuid>,
        request: Json<JoinGroupRequest>,
    ) -> Result<poem_openapi::payload::Json<GroupMembership>, poem_openapi::payload::PlainText<String>> {
        // Check if user can join the group
        let can_join = sqlx::query_scalar!(
            "SELECT can_user_join_group($1, $2)",
            request.user_id,
            *group_id
        )
        .fetch_one(&self.state.db.pool)
        .await
        .map_err(|_| poem_openapi::payload::PlainText("Failed to check permissions".to_string()))?;

        if !can_join.unwrap_or(false) {
            return Err(poem_openapi::payload::PlainText("Cannot join this group".to_string()));
        }

        match GroupMembership::join_group(&self.state.db.pool, *group_id, request.user_id).await {
            Ok(membership) => Ok(poem_openapi::payload::Json(membership)),
            Err(_) => Err(poem_openapi::payload::PlainText("Failed to join group".to_string())),
        }
    }

    /// Leave a group
    #[oai(path = "/groups/:group_id/leave", method = "post", tag = "GroupTags::Groups")]
    async fn leave_group(
        &self,
        group_id: Path<Uuid>,
        user_id: poem_openapi::param::Query<String>,
    ) -> Result<poem_openapi::payload::Json<serde_json::Value>, poem_openapi::payload::PlainText<String>> {
        let user_uuid = Uuid::parse_str(&user_id.0)
            .map_err(|_| poem_openapi::payload::PlainText("Invalid user ID".to_string()))?;

        match GroupMembership::leave_group(&self.state.db.pool, *group_id, user_uuid).await {
            Ok(_) => Ok(poem_openapi::payload::Json(serde_json::json!({"success": true}))),
            Err(_) => Err(poem_openapi::payload::PlainText("Failed to leave group".to_string())),
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
    ) -> Result<poem_openapi::payload::Json<Channel>, poem_openapi::payload::PlainText<String>> {
        let creator_uuid = Uuid::parse_str(&creator_id.0)
            .map_err(|_| poem_openapi::payload::PlainText("Invalid creator ID".to_string()))?;

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
        .map_err(|_| poem_openapi::payload::PlainText("Failed to check permissions".to_string()))?;

        if !can_create.unwrap_or(false) {
            return Err(poem_openapi::payload::PlainText("Permission denied".to_string()));
        }

        match Channel::create(&self.state.db.pool, request.0, self.state.config.instance_fqdn.clone()).await {
            Ok(channel) => Ok(poem_openapi::payload::Json(channel)),
            Err(_) => Err(poem_openapi::payload::PlainText("Failed to create channel".to_string())),
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
    ) -> Result<poem_openapi::payload::Json<UserPermissions>, poem_openapi::payload::PlainText<String>> {
        let admin_uuid = Uuid::parse_str(&admin_id.0)
            .map_err(|_| poem_openapi::payload::PlainText("Invalid admin ID".to_string()))?;

        // Check if requester is admin
        let admin = User::find_by_id(&self.state.db.pool, admin_uuid).await
            .map_err(|_| poem_openapi::payload::PlainText("Failed to find admin".to_string()))?;

        let admin = admin.ok_or_else(|| poem_openapi::payload::PlainText("Admin not found".to_string()))?;

        if !admin.is_admin || admin.instance_fqdn != self.state.config.instance_fqdn {
            return Err(poem_openapi::payload::PlainText("Permission denied".to_string()));
        }

        // Ensure user permissions exist
        UserPermissions::create_or_get(&self.state.db.pool, *user_id, self.state.config.instance_fqdn.clone()).await
            .map_err(|_| poem_openapi::payload::PlainText("Failed to create permissions".to_string()))?;

        match UserPermissions::update(&self.state.db.pool, *user_id, &self.state.config.instance_fqdn, request.0).await {
            Ok(permissions) => Ok(poem_openapi::payload::Json(permissions)),
            Err(_) => Err(poem_openapi::payload::PlainText("Failed to update permissions".to_string())),
        }
    }

    /// List all users with their permissions (admin only)
    #[oai(path = "/admin/users-permissions", method = "get", tag = "GroupTags::Permissions")]
    async fn list_users_with_permissions(
        &self,
        admin_id: poem_openapi::param::Query<String>,
    ) -> Result<poem_openapi::payload::Json<Vec<(User, Option<UserPermissions>)>>, poem_openapi::payload::PlainText<String>> {
        let admin_uuid = Uuid::parse_str(&admin_id.0)
            .map_err(|_| poem_openapi::payload::PlainText("Invalid admin ID".to_string()))?;

        // Check if requester is admin
        let admin = User::find_by_id(&self.state.db.pool, admin_uuid).await
            .map_err(|_| poem_openapi::payload::PlainText("Failed to find admin".to_string()))?;

        let admin = admin.ok_or_else(|| poem_openapi::payload::PlainText("Admin not found".to_string()))?;

        if !admin.is_admin || admin.instance_fqdn != self.state.config.instance_fqdn {
            return Err(poem_openapi::payload::PlainText("Permission denied".to_string()));
        }

        match UserPermissions::list_users_with_permissions(&self.state.db.pool, &self.state.config.instance_fqdn).await {
            Ok(users_permissions) => Ok(poem_openapi::payload::Json(users_permissions)),
            Err(_) => Err(poem_openapi::payload::PlainText("Failed to list users".to_string())),
        }
    }
} 