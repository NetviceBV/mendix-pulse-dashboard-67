-- Setup cron jobs for OWASP async job processing

-- Process async jobs every 2 minutes
SELECT cron.schedule(
  'process-owasp-async-jobs',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url:='https://hfmeoajwhaiobjngpyhe.supabase.co/functions/v1/process-owasp-async-jobs',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmbWVvYWp3aGFpb2JqbmdweWhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0ODAzMDMsImV4cCI6MjA3MzA1NjMwM30.iNcFBg4pLt5BW2sFuANtgZ75a12q4KQt-iqYfXD_Vc8}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- Cleanup stale jobs daily at 2 AM
SELECT cron.schedule(
  'cleanup-stale-owasp-jobs',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url:='https://hfmeoajwhaiobjngpyhe.supabase.co/functions/v1/cleanup-stale-owasp-jobs',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmbWVvYWp3aGFpb2JqbmdweWhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0ODAzMDMsImV4cCI6MjA3MzA1NjMwM30.iNcFBg4pLt5BW2sFuANtgZ75a12q4KQt-iqYfXD_Vc8}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);