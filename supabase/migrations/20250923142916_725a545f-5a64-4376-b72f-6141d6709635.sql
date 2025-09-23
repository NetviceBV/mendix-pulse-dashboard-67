-- Check for orphaned log monitoring settings
-- First, let's see if there are any monitoring settings with environment_ids that don't exist in mendix_environments
SELECT 
  lms.id,
  lms.environment_id,
  lms.user_id,
  me.id as env_exists
FROM log_monitoring_settings lms
LEFT JOIN mendix_environments me ON lms.environment_id = me.id
WHERE me.id IS NULL;

-- Clean up any orphaned records
DELETE FROM log_monitoring_settings 
WHERE environment_id NOT IN (
  SELECT id FROM mendix_environments
);

-- Verify the table structure and relationships
SELECT 
  lms.id,
  lms.environment_id,
  lms.user_id,
  lms.is_enabled,
  me.environment_name,
  me.app_id
FROM log_monitoring_settings lms
JOIN mendix_environments me ON lms.environment_id = me.id
ORDER BY lms.created_at DESC;