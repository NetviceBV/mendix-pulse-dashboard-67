-- Clean up any remaining V1 actions that are stuck in running state
-- V1 actions can be identified by having no last_heartbeat field populated
UPDATE cloud_actions 
SET status = 'failed', 
    error_message = 'V1 action migrated to V2 - please retry if needed',
    completed_at = now()
WHERE status = 'running' 
  AND last_heartbeat IS NULL 
  AND attempt_count >= 3;

-- Update remaining V1 actions to allow V2 retry
UPDATE cloud_actions 
SET status = 'scheduled',
    attempt_count = 0,
    scheduled_for = now()
WHERE status = 'running' 
  AND last_heartbeat IS NULL 
  AND attempt_count < 3;