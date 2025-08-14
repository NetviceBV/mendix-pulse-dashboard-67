-- Add status enum constraint to cloud_actions table
-- Add done and error as valid status values along with existing ones
ALTER TABLE public.cloud_actions 
ADD CONSTRAINT cloud_actions_status_check 
CHECK (status IN ('scheduled', 'running', 'succeeded', 'failed', 'canceled', 'done', 'error'));