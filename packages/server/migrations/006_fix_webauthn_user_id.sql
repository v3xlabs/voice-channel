-- Fix WebAuthn challenges user_id constraint for registration flow

-- During registration, we don't have a user_id yet, so we need to allow NULL
-- and remove the foreign key constraint for registration challenges
ALTER TABLE webauthn_challenges ALTER COLUMN user_id DROP NOT NULL;

-- We'll keep the foreign key constraint but make it handle NULLs properly
-- The constraint will only apply when user_id is not NULL 