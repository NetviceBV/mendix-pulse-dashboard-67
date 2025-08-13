-- Enable necessary extensions for cron scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a cron job to process scheduled cloud actions every minute
SELECT cron.schedule(
  'process-due-cloud-actions',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://uiquvncvmimhbkylfzzp.supabase.co/functions/v1/run-cloud-actions',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpcXV2bmN2bWltaGJreWxmenpwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzM2MjM5MiwiZXhwIjoyMDY4OTM4MzkyfQ.A-zy-b5kOm3LqLqGdvKmXI-Y5RuvQwkHFiPdJ8vIVKI"}'::jsonb,
    body := '{"processAllDue": true}'::jsonb
  ) as request_id;
  $$
);