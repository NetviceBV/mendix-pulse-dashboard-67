-- Add new columns to cloud_actions table for stateful processing
ALTER TABLE public.cloud_actions 
ADD COLUMN package_id text,
ADD COLUMN backup_id text, 
ADD COLUMN current_step text,
ADD COLUMN step_data jsonb,
ADD COLUMN last_heartbeat timestamp with time zone,
ADD COLUMN attempt_count integer DEFAULT 0;