-- Add missing foreign key constraint between log_monitoring_settings and mendix_environments
ALTER TABLE log_monitoring_settings 
ADD CONSTRAINT fk_log_monitoring_settings_environment 
FOREIGN KEY (environment_id) REFERENCES mendix_environments(id) ON DELETE CASCADE;