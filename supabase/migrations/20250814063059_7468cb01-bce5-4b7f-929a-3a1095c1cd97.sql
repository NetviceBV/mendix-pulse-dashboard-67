-- Disable the cron job temporarily for testing
SELECT cron.unschedule('process-due-cloud-actions');