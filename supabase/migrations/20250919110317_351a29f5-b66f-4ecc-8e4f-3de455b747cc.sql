-- Remove legacy V1 cron jobs that are causing conflicts
SELECT cron.unschedule('process-scheduled-cloud-actions');
SELECT cron.unschedule('cleanup-stale-actions');