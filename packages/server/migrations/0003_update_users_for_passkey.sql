-- Add migration script here

-- Update users table for passkey authentication

-- Add passkey_id column
ALTER TABLE users ADD COLUMN passkey_id VARCHAR(255);

-- Remove is_temporary column
ALTER TABLE users DROP COLUMN is_temporary;

-- Add unique constraint for passkey_id when present
ALTER TABLE users ADD CONSTRAINT users_passkey_id_unique UNIQUE (passkey_id) DEFERRABLE INITIALLY DEFERRED;

-- Add index for passkey_id
CREATE INDEX idx_users_passkey_id ON users(passkey_id) WHERE passkey_id IS NOT NULL;
