-- Fix cron job authentication for cloud actions processing
-- Unschedule the old cron job that was using service role authentication
SELECT cron.unschedule('process-scheduled-cloud-actions');

-- Create new cron job with proper authentication for internal cron calls
SELECT cron.schedule(
  'process-scheduled-cloud-actions',
  '* * * * *', -- Every minute
  $$
  SELECT
    net.http_post(
        url:='https://hfmeoajwhaiobjngpyhe.supabase.co/functions/v1/run-cloud-actions',
        headers:='{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmbWVvYWp3aGFpb2JqbmdweWhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0ODAzMDMsImV4cCI6MjA3MzA1NjMwM30.iNcFBg4pLt5BW2sFuANtgZ75a12q4KQt-iqYfXD_Vc8", "x-internal-cron": "1"}'::jsonb,
        body:='{"processAllDue": true}'::jsonb
    ) as request_id;
  $$
);