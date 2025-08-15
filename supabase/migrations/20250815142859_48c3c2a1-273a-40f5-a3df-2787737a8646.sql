-- Add foreign key constraint from mendix_environments.app_id to mendix_apps.app_id
-- This will enable Supabase join syntax to work properly
ALTER TABLE mendix_environments 
ADD CONSTRAINT fk_mendix_environments_app_id 
FOREIGN KEY (app_id) REFERENCES mendix_apps(app_id);