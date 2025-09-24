-- Drop existing cron job and recreate with 1-minute schedule for faster processing
SELECT cron.unschedule('cloud-action-orchestrator-v2');

SELECT cron.schedule(
  'cloud-action-orchestrator-v2',
  '* * * * *', -- every minute instead of every 2 minutes
  $$
  SELECT
    net.http_post(
        url:='https://hfmeoajwhaiobjngpyhe.supabase.co/functions/v1/cloud-action-orchestrator',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmbWVvYWp3aGFpb2JqbmdweWhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0ODAzMDMsImV4cCI6MjA3MzA1NjMwM30.iNcFBg4pLt5BW2sFuANtgZ75a12q4KQt-iqYfXD_Vc8", "x-cron-signature": "internal-cron-call"}'::jsonb,
        body:='{"source": "cron"}'::jsonb
    ) as request_id;
  $$
);