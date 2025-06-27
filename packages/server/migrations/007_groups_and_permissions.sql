-- Groups and Permissions migration

-- Groups table
CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    instance_fqdn VARCHAR(255) NOT NULL,
    
    -- Group permissions
    is_public BOOLEAN NOT NULL DEFAULT true, -- Can anyone see and join channels in this group
    can_create_channels BOOLEAN NOT NULL DEFAULT false, -- Can group members create channels
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure group names are unique per instance
    UNIQUE(name, instance_fqdn)
);

-- Group memberships
CREATE TABLE group_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Membership permissions
    is_admin BOOLEAN NOT NULL DEFAULT false, -- Can manage group and its channels
    can_invite BOOLEAN NOT NULL DEFAULT true, -- Can invite users to the group
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure unique membership per user per group
    UNIQUE(group_id, user_id)
);

-- User permissions table for system-wide permissions
CREATE TABLE user_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    instance_fqdn VARCHAR(255) NOT NULL,
    
    -- Channel creation permissions
    can_create_groups BOOLEAN NOT NULL DEFAULT false,
    can_create_channels_global BOOLEAN NOT NULL DEFAULT false, -- Can create channels in any group they're member of
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure unique permissions per user per instance
    UNIQUE(user_id, instance_fqdn)
);

-- Update channels table to include group reference
ALTER TABLE channels ADD COLUMN group_id UUID REFERENCES groups(id) ON DELETE CASCADE;

-- Create a default "admin" group for each instance
INSERT INTO groups (name, display_name, description, instance_fqdn, is_public, can_create_channels)
SELECT DISTINCT 
    'admin' as name,
    'Admin' as display_name,
    'Administrative channels for instance management' as description,
    instance_fqdn,
    false as is_public, -- Admin group is not public
    true as can_create_channels
FROM users;

-- Add all admin users to the admin group
INSERT INTO group_memberships (group_id, user_id, is_admin, can_invite)
SELECT g.id, u.id, true, true
FROM groups g
JOIN users u ON g.instance_fqdn = u.instance_fqdn
WHERE g.name = 'admin' AND u.is_admin = true;

-- Update existing channels to belong to admin group
UPDATE channels 
SET group_id = g.id
FROM groups g
WHERE channels.instance_fqdn = g.instance_fqdn AND g.name = 'admin';

-- Make group_id required after migration
ALTER TABLE channels ALTER COLUMN group_id SET NOT NULL;

-- Create indexes for performance
CREATE INDEX idx_groups_instance ON groups(instance_fqdn);
CREATE INDEX idx_groups_name ON groups(name);
CREATE INDEX idx_groups_public ON groups(is_public) WHERE is_public = true;
CREATE INDEX idx_group_memberships_group ON group_memberships(group_id);
CREATE INDEX idx_group_memberships_user ON group_memberships(user_id);
CREATE INDEX idx_group_memberships_admin ON group_memberships(is_admin) WHERE is_admin = true;
CREATE INDEX idx_user_permissions_user ON user_permissions(user_id);
CREATE INDEX idx_user_permissions_instance ON user_permissions(instance_fqdn);
CREATE INDEX idx_channels_group ON channels(group_id);

-- Trigger to update updated_at for groups
CREATE TRIGGER update_groups_updated_at 
    BEFORE UPDATE ON groups 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update updated_at for user_permissions
CREATE TRIGGER update_user_permissions_updated_at 
    BEFORE UPDATE ON user_permissions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Function to ensure default admin group exists for new instances
CREATE OR REPLACE FUNCTION ensure_admin_group(target_instance_fqdn VARCHAR(255))
RETURNS UUID AS $$
DECLARE
    admin_group_id UUID;
BEGIN
    -- Check if admin group exists
    SELECT id INTO admin_group_id 
    FROM groups 
    WHERE name = 'admin' AND instance_fqdn = target_instance_fqdn;
    
    -- Create admin group if it doesn't exist
    IF admin_group_id IS NULL THEN
        INSERT INTO groups (name, display_name, description, instance_fqdn, is_public, can_create_channels)
        VALUES ('admin', 'Admin', 'Administrative channels for instance management', target_instance_fqdn, false, true)
        RETURNING id INTO admin_group_id;
    END IF;
    
    RETURN admin_group_id;
END;
$$ LANGUAGE plpgsql;

-- Function to automatically add first admin to admin group
CREATE OR REPLACE FUNCTION add_admin_to_group()
RETURNS TRIGGER AS $$
DECLARE
    admin_group_id UUID;
BEGIN
    -- Only process admin users
    IF NEW.is_admin = true THEN
        -- Ensure admin group exists
        admin_group_id := ensure_admin_group(NEW.instance_fqdn);
        
        -- Add user to admin group if not already a member
        INSERT INTO group_memberships (group_id, user_id, is_admin, can_invite)
        VALUES (admin_group_id, NEW.id, true, true)
        ON CONFLICT (group_id, user_id) DO NOTHING;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to add admins to admin group
CREATE TRIGGER add_admin_to_group_trigger
    AFTER INSERT OR UPDATE ON users
    FOR EACH ROW
    WHEN (NEW.is_admin = true)
    EXECUTE FUNCTION add_admin_to_group();

-- Function to check if user can create channels in a group
CREATE OR REPLACE FUNCTION can_user_create_channel_in_group(user_id UUID, target_group_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_admin BOOLEAN;
    user_instance VARCHAR(255);
    group_instance VARCHAR(255);
    group_allows_creation BOOLEAN;
    is_group_member BOOLEAN;
    is_group_admin BOOLEAN;
    has_global_permission BOOLEAN;
BEGIN
    -- Get user info
    SELECT is_admin, instance_fqdn INTO user_admin, user_instance 
    FROM users WHERE id = user_id;
    
    -- Get group info
    SELECT instance_fqdn, can_create_channels INTO group_instance, group_allows_creation
    FROM groups WHERE id = target_group_id;
    
    -- User must be on the same instance as the group
    IF user_instance != group_instance THEN
        RETURN false;
    END IF;
    
    -- Check if user is member of the group
    SELECT EXISTS(SELECT 1 FROM group_memberships WHERE group_id = target_group_id AND user_id = user_id) INTO is_group_member;
    
    -- Must be a member of the group to create channels
    IF NOT is_group_member THEN
        RETURN false;
    END IF;
    
    -- Check if user is admin of the group
    SELECT is_admin INTO is_group_admin
    FROM group_memberships 
    WHERE group_id = target_group_id AND user_id = user_id;
    
    -- Group admins can always create channels
    IF is_group_admin THEN
        RETURN true;
    END IF;
    
    -- Check if group allows channel creation by members
    IF NOT group_allows_creation THEN
        RETURN false;
    END IF;
    
    -- Check if user has global channel creation permission
    SELECT can_create_channels_global INTO has_global_permission
    FROM user_permissions 
    WHERE user_id = user_id AND instance_fqdn = user_instance;
    
    -- If no user permissions record exists, default to false
    IF has_global_permission IS NULL THEN
        has_global_permission := false;
    END IF;
    
    RETURN has_global_permission;
END;
$$ LANGUAGE plpgsql;

-- Function to check if user can join a group
CREATE OR REPLACE FUNCTION can_user_join_group(user_id UUID, target_group_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_instance VARCHAR(255);
    group_instance VARCHAR(255);
    group_is_public BOOLEAN;
BEGIN
    -- Get user info
    SELECT instance_fqdn INTO user_instance 
    FROM users WHERE id = user_id;
    
    -- Get group info
    SELECT instance_fqdn, is_public INTO group_instance, group_is_public
    FROM groups WHERE id = target_group_id;
    
    -- User must be on the same instance as the group
    IF user_instance != group_instance THEN
        RETURN false;
    END IF;
    
    -- Can join if group is public
    RETURN group_is_public;
END;
$$ LANGUAGE plpgsql; 