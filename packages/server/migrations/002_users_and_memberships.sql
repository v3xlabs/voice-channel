-- Users and Channel Memberships migration

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    instance_fqdn VARCHAR(255) NOT NULL,
    is_temporary BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure username is unique per instance
    UNIQUE(username, instance_fqdn)
);

-- Channel memberships table (joining a channel as a member, not voice call)
CREATE TABLE channel_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Channel reference: (instance_fqdn, channel_name)
    -- If instance_fqdn matches our instance, it's a local channel
    -- Otherwise it's a remote/federated channel
    channel_instance_fqdn VARCHAR(255) NOT NULL,
    channel_name VARCHAR(255) NOT NULL,
    
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure user can only be a member once per channel
    UNIQUE(user_id, channel_instance_fqdn, channel_name)
);

-- Create indexes for performance
CREATE INDEX idx_users_username_instance ON users(username, instance_fqdn);
CREATE INDEX idx_users_instance_fqdn ON users(instance_fqdn);
CREATE INDEX idx_channel_memberships_user_id ON channel_memberships(user_id);
CREATE INDEX idx_channel_memberships_channel ON channel_memberships(channel_instance_fqdn, channel_name);

-- Trigger to automatically update updated_at for users
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Function to update last_active when accessing channel
CREATE OR REPLACE FUNCTION update_membership_last_active()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_active = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to update last_active on membership updates
CREATE TRIGGER update_membership_last_active 
    BEFORE UPDATE ON channel_memberships 
    FOR EACH ROW 
    EXECUTE FUNCTION update_membership_last_active(); 