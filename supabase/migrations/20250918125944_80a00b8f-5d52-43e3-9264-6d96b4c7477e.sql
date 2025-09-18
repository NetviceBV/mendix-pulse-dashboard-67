-- Fix the function search path security warning
CREATE OR REPLACE FUNCTION normalize_environment_name(env_name text)
RETURNS text AS $$
BEGIN
  -- Capitalize the first letter and make the rest lowercase
  RETURN INITCAP(LOWER(env_name));
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = 'public';