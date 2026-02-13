
-- Step 1: Delete duplicate apps, keeping the newest per (project_id, user_id)
DELETE FROM mendix_apps a
USING mendix_apps b
WHERE a.project_id = b.project_id
  AND a.user_id = b.user_id
  AND a.updated_at < b.updated_at;

-- Step 2: Delete duplicate environments, keeping the newest per (environment_id, user_id)
DELETE FROM mendix_environments a
USING mendix_environments b
WHERE a.environment_id = b.environment_id
  AND a.user_id = b.user_id
  AND a.updated_at < b.updated_at;

-- Step 3: Add unique constraint on mendix_apps (project_id, user_id)
ALTER TABLE mendix_apps
ADD CONSTRAINT uq_mendix_apps_project_user UNIQUE (project_id, user_id);

-- Step 4: Add unique constraint on mendix_environments (environment_id, user_id)
ALTER TABLE mendix_environments
ADD CONSTRAINT uq_mendix_environments_env_user UNIQUE (environment_id, user_id);
