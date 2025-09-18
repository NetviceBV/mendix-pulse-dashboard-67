-- Add foreign key constraints for user_id columns to auth.users(id)
-- This ensures referential integrity and automatic cleanup when users are deleted
-- Note: profiles table already has this constraint, so we skip it

-- Add foreign key constraint for mendix_credentials table
ALTER TABLE public.mendix_credentials 
ADD CONSTRAINT mendix_credentials_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add foreign key constraint for mendix_apps table
ALTER TABLE public.mendix_apps 
ADD CONSTRAINT mendix_apps_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add foreign key constraint for mendix_environments table
ALTER TABLE public.mendix_environments 
ADD CONSTRAINT mendix_environments_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add foreign key constraint for mendix_logs table
ALTER TABLE public.mendix_logs 
ADD CONSTRAINT mendix_logs_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add foreign key constraint for webhook_api_keys table
ALTER TABLE public.webhook_api_keys 
ADD CONSTRAINT webhook_api_keys_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add foreign key constraint for vulnerability_scans table
ALTER TABLE public.vulnerability_scans 
ADD CONSTRAINT vulnerability_scans_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add foreign key constraint for cloud_actions table
ALTER TABLE public.cloud_actions 
ADD CONSTRAINT cloud_actions_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add foreign key constraint for cloud_action_logs table
ALTER TABLE public.cloud_action_logs 
ADD CONSTRAINT cloud_action_logs_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add foreign key constraint for log_monitoring_settings table
ALTER TABLE public.log_monitoring_settings 
ADD CONSTRAINT log_monitoring_settings_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add foreign key constraint for log_monitoring_alerts table
ALTER TABLE public.log_monitoring_alerts 
ADD CONSTRAINT log_monitoring_alerts_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;