-- Update cron job frequency from every 2 minutes to every 1 minute for faster processing

-- Unschedule the existing job
SELECT cron.unschedule('process-owasp-async-jobs');

-- Recreate with 1-minute interval
SELECT cron.schedule(
  'process-owasp-async-jobs',
  '* * * * *', -- Every 1 minute (changed from */2)
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