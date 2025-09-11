-- Enable pg_net extension for HTTP requests from cron jobs
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a cron job to automatically process scheduled cloud actions every minute
SELECT cron.schedule(
  'process-scheduled-cloud-actions',
  '* * * * *', -- Every minute
  $$
  SELECT
    net.http_post(
        url:='https://hfmeoajwhaiobjngpyhe.supabase.co/functions/v1/run-cloud-actions',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmbWVvYWp3aGFpb2JqbmdweWhlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzQ4MDMwMywiZXhwIjoyMDczMDU2MzAzfQ.vhVBzl2z4Jyj8i7ifq9rR1EjSKF7ZdwkMbb7nu2mWsk"}'::jsonb,
        body:='{"processAllDue": true}'::jsonb
    ) as request_id;
  $$
);