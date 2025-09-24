-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create cron job to run log monitoring every minute
SELECT cron.schedule(
  'process-log-monitoring-every-minute',
  '* * * * *', -- every minute
  $$
  SELECT
    net.http_post(
        url:='https://hfmeoajwhaiobjngpyhe.supabase.co/functions/v1/process-log-monitoring',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmbWVvYWp3aGFpb2JqbmdweWhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0ODAzMDMsImV4cCI6MjA3MzA1NjMwM30.iNcFBg4pLt5BW2sFuANtgZ75a12q4KQt-iqYfXD_Vc8"}'::jsonb,
        body:=concat('{"triggered_at": "', now(), '"}')::jsonb
    ) as request_id;
  $$
);