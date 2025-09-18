-- Step 1: Clean up existing duplicates by keeping the most recent record for each environment_id
DELETE FROM mendix_environments 
WHERE id NOT IN (
  SELECT DISTINCT ON (environment_id, credential_id) id
  FROM mendix_environments 
  ORDER BY environment_id, credential_id, updated_at DESC
);

-- Step 2: Drop the old unique constraint that was causing the duplicates
ALTER TABLE mendix_environments 
DROP CONSTRAINT IF EXISTS mendix_environments_app_id_environment_name_credential_id_key;

-- Step 3: Add new unique constraint on environment_id and credential_id (the true unique identifiers)
ALTER TABLE mendix_environments 
ADD CONSTRAINT mendix_environments_environment_id_credential_id_key 
UNIQUE (environment_id, credential_id);

-- Step 4: Create a function to normalize environment names for consistent display
CREATE OR REPLACE FUNCTION normalize_environment_name(env_name text)
RETURNS text AS $$
BEGIN
  -- Capitalize the first letter and make the rest lowercase
  RETURN INITCAP(LOWER(env_name));
END;
$$ LANGUAGE plpgsql IMMUTABLE;