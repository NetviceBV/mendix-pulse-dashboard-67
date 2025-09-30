-- Rename test_table to system_heartbeat
ALTER TABLE public.test_table RENAME TO system_heartbeat;

-- Rename columns to meaningful names
ALTER TABLE public.system_heartbeat RENAME COLUMN test_column_1 TO heartbeat_type;
ALTER TABLE public.system_heartbeat RENAME COLUMN test_column_2 TO heartbeat_counter;

-- Add policy to allow service role to insert heartbeat records
CREATE POLICY "Service role can insert heartbeat records"
ON public.system_heartbeat
FOR INSERT
WITH CHECK (auth.role() = 'service_role' OR auth.uid() = user_id);

-- Enable pg_cron extension if not already enabled (for cron jobs)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension if not already enabled (for HTTP requests)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule daily heartbeat at 12:00 UTC
SELECT cron.schedule(
  'daily-keep-alive-heartbeat',
  '0 12 * * *', -- Every day at 12:00 UTC
  $$
  SELECT
    net.http_post(
      url:='https://hfmeoajwhaiobjngpyhe.supabase.co/functions/v1/keep-alive-heartbeat',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmbWVvYWp3aGFpb2JqbmdweWhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0ODAzMDMsImV4cCI6MjA3MzA1NjMwM30.iNcFBg4pLt5BW2sFuANtgZ75a12q4KQt-iqYfXD_Vc8"}'::jsonb,
      body:='{"source": "cron"}'::jsonb
    ) as request_id;
  $$
);