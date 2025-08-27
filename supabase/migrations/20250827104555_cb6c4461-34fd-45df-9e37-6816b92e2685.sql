-- First, remove any potential duplicates before adding constraints
-- For mendix_apps: Keep only the most recent record for each (app_id, credential_id) combination
DELETE FROM public.mendix_apps 
WHERE id NOT IN (
  SELECT DISTINCT ON (app_id, credential_id) id
  FROM public.mendix_apps
  ORDER BY app_id, credential_id, updated_at DESC
);

-- For mendix_environments: Keep only the most recent record for each (app_id, environment_name, credential_id) combination
DELETE FROM public.mendix_environments 
WHERE id NOT IN (
  SELECT DISTINCT ON (app_id, environment_name, credential_id) id
  FROM public.mendix_environments
  ORDER BY app_id, environment_name, credential_id, updated_at DESC
);

-- Add unique constraint for mendix_apps to prevent duplicate apps from same credential
ALTER TABLE public.mendix_apps 
ADD CONSTRAINT uk_mendix_apps_app_credential 
UNIQUE (app_id, credential_id);

-- Add unique constraint for mendix_environments to prevent duplicate environments
ALTER TABLE public.mendix_environments 
ADD CONSTRAINT uk_mendix_environments_app_env_credential 
UNIQUE (app_id, environment_name, credential_id);