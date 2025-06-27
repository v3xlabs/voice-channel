-- Fix for first user admin assignment bug
-- The original function checked user_count = 1, but since the trigger runs BEFORE INSERT,
-- it should check user_count = 0 for the first user

-- Drop and recreate the function with the correct logic
DROP FUNCTION IF EXISTS make_first_user_admin();

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

-- Fix any existing instances where the wrong user is admin
-- This identifies cases where user #2 is admin but user #1 is not, and fixes them
DO $$
DECLARE
    instance_record RECORD;
    first_user_id UUID;
    second_user_id UUID;
BEGIN
    -- For each instance, check if the admin assignment is wrong
    FOR instance_record IN 
        SELECT DISTINCT instance_fqdn 
        FROM users 
    LOOP
        -- Get the first user (oldest) for this instance
        SELECT id INTO first_user_id
        FROM users 
        WHERE instance_fqdn = instance_record.instance_fqdn
        ORDER BY created_at ASC 
        LIMIT 1;
        
        -- Get the second user for this instance (if exists)
        SELECT id INTO second_user_id
        FROM users 
        WHERE instance_fqdn = instance_record.instance_fqdn
        ORDER BY created_at ASC 
        OFFSET 1 LIMIT 1;
        
        -- If we have at least 2 users, check if the wrong one is admin
        IF first_user_id IS NOT NULL AND second_user_id IS NOT NULL THEN
            -- Check if first user is NOT admin and second user IS admin
            IF EXISTS (
                SELECT 1 FROM users 
                WHERE id = first_user_id AND is_admin = false
            ) AND EXISTS (
                SELECT 1 FROM users 
                WHERE id = second_user_id AND is_admin = true
            ) THEN
                -- Fix the admin assignment
                UPDATE users SET is_admin = true WHERE id = first_user_id;
                UPDATE users SET is_admin = false WHERE id = second_user_id;
                
                RAISE NOTICE 'Fixed admin assignment for instance %: user % is now admin instead of user %', 
                    instance_record.instance_fqdn, first_user_id, second_user_id;
            END IF;
        END IF;
    END LOOP;
END;
$$; 