-- Fix scheduled cloud actions cron job to use correct project ID
-- First, unschedule the old cron job with incorrect project reference
SELECT cron.unschedule('backup-cloud-actions');

-- Create new cron job with correct project ID (hfmeoajwhaiobjngpyhe)
SELECT cron.schedule(
  'backup-cloud-actions',
  '0 2 * * *', -- Run at 2 AM daily
  $$
  SELECT
    net.http_post(
        url:='https://hfmeoajwhaiobjngpyhe.supabase.co/functions/v1/run-cloud-actions-backup',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmbWVvYWp3aGFpb2JqbmdweWhlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzQ4MDMwMywiZXhwIjoyMDczMDU2MzAzfQ.wpH4m6c9r8AHqGmVVF5OI1EWWjJGd-wqHWh6BIJnUhU"}'::jsonb
    ) as request_id;
  $$
);