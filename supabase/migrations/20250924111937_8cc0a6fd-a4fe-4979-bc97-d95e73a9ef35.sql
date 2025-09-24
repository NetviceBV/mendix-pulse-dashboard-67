-- Add whitelist_patterns column to log_monitoring_settings table
ALTER TABLE public.log_monitoring_settings 
ADD COLUMN whitelist_patterns JSONB DEFAULT '[]'::jsonb;