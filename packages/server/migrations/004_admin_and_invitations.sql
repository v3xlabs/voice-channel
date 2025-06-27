-- Admin and Invitation System migration

-- Add admin role to users table
ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;

-- Instance settings table for per-instance configuration
CREATE TABLE instance_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    instance_fqdn VARCHAR(255) NOT NULL UNIQUE,
    
    -- Registration settings
    registration_mode VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (registration_mode IN ('open', 'invite-only')),
    
    -- Invitation settings
    invite_permission VARCHAR(20) NOT NULL DEFAULT 'anyone' CHECK (invite_permission IN ('admin-only', 'anyone', 'limited')),
    invite_limit INTEGER DEFAULT NULL, -- NULL means unlimited, otherwise max invites per user
    
    -- Instance metadata
    instance_name VARCHAR(255) NOT NULL DEFAULT 'Voice Channel Instance',
    instance_description TEXT DEFAULT NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Invitations table
CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    instance_fqdn VARCHAR(255) NOT NULL,
    
    -- Invitation details
    invite_code VARCHAR(32) NOT NULL UNIQUE, -- Random string for invitation URL
    invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invited_email VARCHAR(255) DEFAULT NULL, -- Optional: specific email invitation
    
    -- Usage tracking
    max_uses INTEGER NOT NULL DEFAULT 1, -- How many times this invite can be used
    current_uses INTEGER NOT NULL DEFAULT 0,
    
    -- Expiration
    expires_at TIMESTAMPTZ DEFAULT NULL, -- NULL means never expires
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    used_at TIMESTAMPTZ DEFAULT NULL
);

-- Track invitation usage
CREATE TABLE invitation_uses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invitation_id UUID NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
    used_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(invitation_id, used_by) -- Prevent same user from using same invite multiple times
);

-- Create indexes for performance
CREATE INDEX idx_users_admin ON users(is_admin) WHERE is_admin = true;
CREATE INDEX idx_instance_settings_fqdn ON instance_settings(instance_fqdn);
CREATE INDEX idx_invitations_code ON invitations(invite_code);
CREATE INDEX idx_invitations_instance ON invitations(instance_fqdn);
CREATE INDEX idx_invitations_invited_by ON invitations(invited_by);
CREATE INDEX idx_invitations_active ON invitations(is_active) WHERE is_active = true;
CREATE INDEX idx_invitation_uses_invitation ON invitation_uses(invitation_id);
CREATE INDEX idx_invitation_uses_user ON invitation_uses(used_by);

-- Trigger to update updated_at for instance_settings
CREATE TRIGGER update_instance_settings_updated_at 
    BEFORE UPDATE ON instance_settings 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Function to check if user can create invitations
CREATE OR REPLACE FUNCTION can_user_create_invitation(user_id UUID, target_instance_fqdn VARCHAR(255))
RETURNS BOOLEAN AS $$
DECLARE
    user_admin BOOLEAN;
    user_instance VARCHAR(255);
    settings_permission VARCHAR(20);
    settings_limit INTEGER;
    user_invite_count INTEGER;
BEGIN
    -- Get user info
    SELECT is_admin, instance_fqdn INTO user_admin, user_instance 
    FROM users WHERE id = user_id;
    
    -- User must be on the same instance
    IF user_instance != target_instance_fqdn THEN
        RETURN false;
    END IF;
    
    -- Get instance settings
    SELECT invite_permission, invite_limit INTO settings_permission, settings_limit
    FROM instance_settings WHERE instance_fqdn = target_instance_fqdn;
    
    -- If no settings exist, use defaults (anyone can invite)
    IF NOT FOUND THEN
        settings_permission := 'anyone';
        settings_limit := NULL;
    END IF;
    
    -- Check permission level
    CASE settings_permission
        WHEN 'admin-only' THEN
            IF NOT user_admin THEN
                RETURN false;
            END IF;
        WHEN 'anyone' THEN
            -- Anyone can invite, continue to limit check
        WHEN 'limited' THEN
            -- Check invite limit if set
            IF settings_limit IS NOT NULL THEN
                SELECT COUNT(*) INTO user_invite_count
                FROM invitations 
                WHERE invited_by = user_id AND instance_fqdn = target_instance_fqdn;
                
                IF user_invite_count >= settings_limit THEN
                    RETURN false;
                END IF;
            END IF;
    END CASE;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Function to create default instance settings for new instances
CREATE OR REPLACE FUNCTION ensure_instance_settings(target_instance_fqdn VARCHAR(255))
RETURNS VOID AS $$
BEGIN
    INSERT INTO instance_settings (instance_fqdn, instance_name)
    VALUES (target_instance_fqdn, target_instance_fqdn || ' Voice Channel')
    ON CONFLICT (instance_fqdn) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Function to make first user admin on new instances
CREATE OR REPLACE FUNCTION make_first_user_admin()
RETURNS TRIGGER AS $$
DECLARE
    user_count INTEGER;
BEGIN
    -- Check if this is the first user on this instance
    SELECT COUNT(*) INTO user_count 
    FROM users 
    WHERE instance_fqdn = NEW.instance_fqdn;
    
    -- If this is the first user, make them admin
    -- Note: COUNT is 0 because this trigger runs BEFORE INSERT
    IF user_count = 0 THEN
        NEW.is_admin := true;
        
        -- Ensure instance settings exist
        PERFORM ensure_instance_settings(NEW.instance_fqdn);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to make first user admin
CREATE TRIGGER make_first_user_admin_trigger
    BEFORE INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION make_first_user_admin(); 