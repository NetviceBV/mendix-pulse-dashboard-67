-- First, make app_id unique in mendix_apps table, then add foreign key constraint
-- Step 1: Add unique constraint to mendix_apps.app_id
ALTER TABLE mendix_apps ADD CONSTRAINT uk_mendix_apps_app_id UNIQUE (app_id);

-- Step 2: Add foreign key constraint from mendix_environments.app_id to mendix_apps.app_id
ALTER TABLE mendix_environments 
ADD CONSTRAINT fk_mendix_environments_app_id 
FOREIGN KEY (app_id) REFERENCES mendix_apps(app_id);