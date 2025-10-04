-- Fix cron jobs with proper JSON header formatting

-- Unschedule the existing broken cron jobs
SELECT cron.unschedule('process-owasp-async-jobs');
SELECT cron.unschedule('cleanup-stale-owasp-jobs');

-- Recreate process-owasp-async-jobs with proper header formatting (every 2 minutes)
SELECT cron.schedule(
  'process-owasp-async-jobs',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url:='https://hfmeoajwhaiobjngpyhe.supabase.co/functions/v1/process-owasp-async-jobs',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmbWVvYWp3aGFpb2JqbmdweWhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0ODAzMDMsImV4cCI6MjA3MzA1NjMwM30.iNcFBg4pLt5BW2sFuANtgZ75a12q4KQt-iqYfXD_Vc8'
    ),
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- Recreate cleanup-stale-owasp-jobs with proper header formatting (daily at 2 AM)
SELECT cron.schedule(
  'cleanup-stale-owasp-jobs',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url:='https://hfmeoajwhaiobjngpyhe.supabase.co/functions/v1/cleanup-stale-owasp-jobs',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmbWVvYWp3aGFpb2JqbmdweWhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0ODAzMDMsImV4cCI6MjA3MzA1NjMwM30.iNcFBg4pLt5BW2sFuANtgZ75a12q4KQt-iqYfXD_Vc8'
    ),
    body:='{}'::jsonb
  ) as request_id;
  $$
);