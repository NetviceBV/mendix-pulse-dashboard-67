-- First, remove duplicate owasp_check_results keeping only the most recent
DELETE FROM public.owasp_check_results a
USING public.owasp_check_results b
WHERE a.user_id = b.user_id
  AND a.app_id = b.app_id
  AND a.environment_name = b.environment_name
  AND a.owasp_step_id = b.owasp_step_id
  AND a.checked_at < b.checked_at;

-- Now add the unique constraint
ALTER TABLE public.owasp_check_results
ADD CONSTRAINT owasp_check_results_unique_user_app_env_step
UNIQUE (user_id, app_id, environment_name, owasp_step_id);