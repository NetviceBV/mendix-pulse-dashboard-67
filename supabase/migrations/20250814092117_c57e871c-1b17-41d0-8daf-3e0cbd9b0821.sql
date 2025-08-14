-- Add retry_until column to cloud_actions table
ALTER TABLE public.cloud_actions 
ADD COLUMN retry_until TIMESTAMP WITH TIME ZONE;