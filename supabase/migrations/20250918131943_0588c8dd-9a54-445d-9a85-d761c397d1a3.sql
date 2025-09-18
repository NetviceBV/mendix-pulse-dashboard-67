-- Remove existing constraints that don't properly handle multi-user scenarios
ALTER TABLE public.mendix_environments DROP CONSTRAINT IF EXISTS uk_mendix_environments_app_env_credential;
ALTER TABLE public.mendix_environments DROP CONSTRAINT IF EXISTS mendix_environments_environment_id_credential_id_key;

-- Add new constraint that includes user_id to properly handle multiple users accessing same environments
ALTER TABLE public.mendix_environments ADD CONSTRAINT uk_mendix_environments_env_cred_user 
UNIQUE (environment_id, credential_id, user_id);