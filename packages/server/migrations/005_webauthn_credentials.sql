-- WebAuthn Credentials Migration

-- Create table for storing WebAuthn credentials
CREATE TABLE user_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id BYTEA NOT NULL UNIQUE,
    public_key BYTEA NOT NULL,
    counter BIGINT NOT NULL DEFAULT 0,
    name VARCHAR(255), -- User-friendly name for the credential
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

-- Create table for storing WebAuthn challenges (temporary storage)
CREATE TABLE webauthn_challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    challenge_id VARCHAR(255) NOT NULL UNIQUE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    challenge_data TEXT NOT NULL, -- JSON serialized challenge
    challenge_type VARCHAR(20) NOT NULL, -- 'registration' or 'authentication'
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Optional fields for registration
    display_name VARCHAR(255),
    invite_code VARCHAR(8)
);

-- Update users table to track passkey status
ALTER TABLE users ADD COLUMN has_passkey BOOLEAN NOT NULL DEFAULT FALSE;

-- Remove the unused passkey_id column since we'll use the credentials table
ALTER TABLE users DROP COLUMN IF EXISTS passkey_id;

-- Create indexes for performance
CREATE INDEX idx_user_credentials_user_id ON user_credentials(user_id);
CREATE INDEX idx_user_credentials_credential_id ON user_credentials(credential_id);
CREATE INDEX idx_webauthn_challenges_challenge_id ON webauthn_challenges(challenge_id);
CREATE INDEX idx_webauthn_challenges_user_id ON webauthn_challenges(user_id);
CREATE INDEX idx_webauthn_challenges_expires_at ON webauthn_challenges(expires_at);

-- Function to clean up expired challenges
CREATE OR REPLACE FUNCTION cleanup_expired_challenges()
RETURNS void AS $$
BEGIN
    DELETE FROM webauthn_challenges WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Create a periodic cleanup job (requires pg_cron extension in production)
-- For now, we'll clean up programmatically 