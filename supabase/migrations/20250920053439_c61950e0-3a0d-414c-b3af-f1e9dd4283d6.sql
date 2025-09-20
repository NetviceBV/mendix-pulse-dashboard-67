-- Update cloud action orchestrator cron job to run every minute for faster processing
UPDATE cron.job 
SET schedule = '* * * * *' 
WHERE jobname = 'cloud-action-orchestrator-v2';