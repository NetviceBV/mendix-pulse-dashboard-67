-- Update cloud_actions_action_type_check constraint to match frontend options
ALTER TABLE public.cloud_actions 
DROP CONSTRAINT IF EXISTS cloud_actions_action_type_check;

ALTER TABLE public.cloud_actions 
ADD CONSTRAINT cloud_actions_action_type_check 
CHECK (action_type IN ('start', 'stop', 'restart', 'transport', 'deploy'));