-- Voice Channel Comprehensive Initial Schema
-- All tables with proper primary key naming (user_id, channel_id, etc.)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Function to update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Users table
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    instance_fqdn VARCHAR(255) NOT NULL,
    is_admin BOOLEAN NOT NULL DEFAULT false,
    has_passkey BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(username, instance_fqdn)
);

-- Groups table
CREATE TABLE groups (
    group_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    instance_fqdn VARCHAR(255) NOT NULL,
    is_public BOOLEAN NOT NULL DEFAULT true,
    can_create_channels BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(name, instance_fqdn),
    CONSTRAINT groups_name_pattern_check 
        CHECK (name ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(name) >= 1 AND length(name) <= 50)
);

-- Group memberships table
CREATE TABLE group_memberships (
    membership_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    is_admin BOOLEAN NOT NULL DEFAULT false,
    can_invite BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(group_id, user_id)
);

-- User permissions table
CREATE TABLE user_permissions (
    permission_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    instance_fqdn VARCHAR(255) NOT NULL,
    can_create_groups BOOLEAN NOT NULL DEFAULT false,
    can_create_channels_global BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(user_id, instance_fqdn)
);

-- Channels table
CREATE TABLE channels (
    channel_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    instance_fqdn VARCHAR(255) NOT NULL,
    group_id UUID NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
    max_participants INTEGER NOT NULL DEFAULT 50,
    current_participants INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(name, group_id),
    CONSTRAINT channels_name_pattern_check 
        CHECK (name ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(name) >= 1 AND length(name) <= 50)
);

-- Channel memberships table
CREATE TABLE channel_memberships (
    membership_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    channel_instance_fqdn VARCHAR(255) NOT NULL,
    channel_name VARCHAR(255) NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(user_id, channel_instance_fqdn, channel_name)
);

-- Instance settings table
CREATE TABLE instance_settings (
    settings_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    instance_fqdn VARCHAR(255) UNIQUE NOT NULL,
    registration_mode VARCHAR(50) NOT NULL DEFAULT 'invite_only',
    invite_permission VARCHAR(50) NOT NULL DEFAULT 'admin_only',
    invite_limit INTEGER,
    instance_name VARCHAR(255) NOT NULL,
    instance_description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Invitations table
CREATE TABLE invitations (
    invitation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invite_code VARCHAR(255) UNIQUE NOT NULL,
    created_by UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    invited_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    invited_email VARCHAR(255),
    instance_fqdn VARCHAR(255) NOT NULL,
    max_uses INTEGER,
    current_uses INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    expires_at TIMESTAMPTZ,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Invitation uses table (tracks who used which invitation)
CREATE TABLE invitation_uses (
    use_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invitation_id UUID NOT NULL REFERENCES invitations(invitation_id) ON DELETE CASCADE,
    used_by UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(invitation_id, used_by)
);

-- WebAuthn credentials table
CREATE TABLE webauthn_credentials (
    credential_id VARCHAR(255) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    public_key BYTEA NOT NULL,
    sign_count BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User credentials table (alternative WebAuthn table structure)
CREATE TABLE user_credentials (
    credential_record_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    credential_id VARCHAR(255) NOT NULL UNIQUE,
    public_key BYTEA NOT NULL,
    counter BIGINT NOT NULL DEFAULT 0,
    name VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

-- WebAuthn challenges table (for authentication flow)
CREATE TABLE webauthn_challenges (
    challenge_record_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    challenge_id VARCHAR(255) NOT NULL UNIQUE,
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    challenge_data TEXT NOT NULL,
    challenge_type VARCHAR(50) NOT NULL, -- 'registration' or 'authentication'
    display_name VARCHAR(255),
    invite_code VARCHAR(255),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_users_instance ON users(instance_fqdn);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_admin ON users(is_admin) WHERE is_admin = true;

CREATE INDEX idx_groups_instance ON groups(instance_fqdn);
CREATE INDEX idx_groups_name ON groups(name);
CREATE INDEX idx_groups_public ON groups(is_public) WHERE is_public = true;

CREATE INDEX idx_group_memberships_group ON group_memberships(group_id);
CREATE INDEX idx_group_memberships_user ON group_memberships(user_id);
CREATE INDEX idx_group_memberships_admin ON group_memberships(is_admin) WHERE is_admin = true;

CREATE INDEX idx_user_permissions_user ON user_permissions(user_id);
CREATE INDEX idx_user_permissions_instance ON user_permissions(instance_fqdn);

CREATE INDEX idx_channels_group ON channels(group_id);
CREATE INDEX idx_channels_instance ON channels(instance_fqdn);
CREATE INDEX idx_channels_name ON channels(name);

CREATE INDEX idx_channel_memberships_user ON channel_memberships(user_id);
CREATE INDEX idx_channel_memberships_channel ON channel_memberships(channel_instance_fqdn, channel_name);
CREATE INDEX idx_channel_memberships_active ON channel_memberships(last_active);

CREATE INDEX idx_instance_settings_fqdn ON instance_settings(instance_fqdn);

CREATE INDEX idx_invitations_code ON invitations(invite_code);
CREATE INDEX idx_invitations_creator ON invitations(created_by);
CREATE INDEX idx_invitations_instance ON invitations(instance_fqdn);
CREATE INDEX idx_invitations_expires ON invitations(expires_at);

CREATE INDEX idx_invitation_uses_invitation ON invitation_uses(invitation_id);
CREATE INDEX idx_invitation_uses_user ON invitation_uses(used_by);

CREATE INDEX idx_webauthn_credentials_user ON webauthn_credentials(user_id);

CREATE INDEX idx_user_credentials_user ON user_credentials(user_id);
CREATE INDEX idx_user_credentials_credential_id ON user_credentials(credential_id);

CREATE INDEX idx_webauthn_challenges_user ON webauthn_challenges(user_id);
CREATE INDEX idx_webauthn_challenges_challenge_id ON webauthn_challenges(challenge_id);
CREATE INDEX idx_webauthn_challenges_expires ON webauthn_challenges(expires_at);

-- Create triggers for updated_at columns
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_groups_updated_at 
    BEFORE UPDATE ON groups 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_permissions_updated_at 
    BEFORE UPDATE ON user_permissions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_channels_updated_at 
    BEFORE UPDATE ON channels 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_instance_settings_updated_at 
    BEFORE UPDATE ON instance_settings 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invitations_updated_at 
    BEFORE UPDATE ON invitations 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webauthn_credentials_updated_at 
    BEFORE UPDATE ON webauthn_credentials 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Function to ensure default admin group exists for new instances
CREATE OR REPLACE FUNCTION ensure_admin_group(target_instance_fqdn VARCHAR(255))
RETURNS UUID AS $$
DECLARE
    admin_group_id UUID;
BEGIN
    -- Check if admin group exists
    SELECT group_id INTO admin_group_id 
    FROM groups 
    WHERE name = 'admin' AND instance_fqdn = target_instance_fqdn;
    
    -- Create admin group if it doesn't exist
    IF admin_group_id IS NULL THEN
        INSERT INTO groups (name, display_name, description, instance_fqdn, is_public, can_create_channels)
        VALUES ('admin', 'Admin', 'Administrative channels for instance management', target_instance_fqdn, false, true)
        RETURNING group_id INTO admin_group_id;
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
        VALUES (admin_group_id, NEW.user_id, true, true)
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
CREATE OR REPLACE FUNCTION can_user_create_channel_in_group(p_user_id UUID, p_group_id UUID)
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
    FROM users WHERE user_id = p_user_id;
    
    -- Get group info
    SELECT instance_fqdn, can_create_channels INTO group_instance, group_allows_creation
    FROM groups WHERE group_id = p_group_id;
    
    -- User must be on the same instance as the group
    IF user_instance != group_instance THEN
        RETURN false;
    END IF;
    
    -- Check if user is member of the group
    SELECT EXISTS(SELECT 1 FROM group_memberships WHERE group_id = p_group_id AND user_id = p_user_id) INTO is_group_member;
    
    -- Must be a member of the group to create channels
    IF NOT is_group_member THEN
        RETURN false;
    END IF;
    
    -- Check if user is admin of the group
    SELECT is_admin INTO is_group_admin
    FROM group_memberships 
    WHERE group_id = p_group_id AND user_id = p_user_id;
    
    -- Group admins can always create channels
    IF is_group_admin THEN
        RETURN true;
    END IF;
    
    -- Check global permission for channel creation
    SELECT can_create_channels_global INTO has_global_permission
    FROM user_permissions 
    WHERE user_id = p_user_id AND instance_fqdn = user_instance;
    
    -- If user has global permission and group allows creation, they can create
    IF has_global_permission AND group_allows_creation THEN
        RETURN true;
    END IF;
    
    -- Instance admins can create channels in any group
    IF user_admin THEN
        RETURN true;
    END IF;
    
    RETURN false;
END;
$$ LANGUAGE plpgsql;

-- Function to check if user can join a group
CREATE OR REPLACE FUNCTION can_user_join_group(p_user_id UUID, p_group_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_instance VARCHAR(255);
    group_instance VARCHAR(255);
    group_is_public BOOLEAN;
    already_member BOOLEAN;
BEGIN
    -- Get user info
    SELECT instance_fqdn INTO user_instance 
    FROM users WHERE user_id = p_user_id;
    
    -- Get group info
    SELECT instance_fqdn, is_public INTO group_instance, group_is_public
    FROM groups WHERE group_id = p_group_id;
    
    -- User must be on the same instance as the group
    IF user_instance != group_instance THEN
        RETURN false;
    END IF;
    
    -- Check if already a member
    SELECT EXISTS(SELECT 1 FROM group_memberships WHERE group_id = p_group_id AND user_id = p_user_id) INTO already_member;
    
    -- Can't join if already a member
    IF already_member THEN
        RETURN false;
    END IF;
    
    -- Can join if group is public
    RETURN group_is_public;
END;
$$ LANGUAGE plpgsql;

-- Function to check if user can create invitations
CREATE OR REPLACE FUNCTION can_user_create_invitation(p_user_id UUID, p_instance_fqdn VARCHAR(255))
RETURNS BOOLEAN AS $$
DECLARE
    user_admin BOOLEAN;
    user_instance VARCHAR(255);
    settings_invite_permission VARCHAR(50);
BEGIN
    -- Get user info
    SELECT is_admin, instance_fqdn INTO user_admin, user_instance 
    FROM users WHERE user_id = p_user_id;
    
    -- User must be on the same instance
    IF user_instance != p_instance_fqdn THEN
        RETURN false;
    END IF;
    
    -- Get instance settings
    SELECT invite_permission INTO settings_invite_permission
    FROM instance_settings 
    WHERE instance_fqdn = p_instance_fqdn;
    
    -- Default to admin_only if no settings found
    settings_invite_permission := COALESCE(settings_invite_permission, 'admin_only');
    
    -- Check permission based on settings
    CASE settings_invite_permission
        WHEN 'admin_only' THEN
            RETURN user_admin;
        WHEN 'anyone' THEN
            RETURN true;
        ELSE
            RETURN user_admin;
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- Add comments to document the naming patterns
COMMENT ON COLUMN groups.name IS 'URL-safe group name following pattern: ([a-z0-9]-?[a-z0-9])+ with length 1-50';
COMMENT ON COLUMN channels.name IS 'URL-safe channel name following pattern: ([a-z0-9]-?[a-z0-9])+ with length 1-50'; 