-- Create function to increment app warning count
CREATE OR REPLACE FUNCTION public.increment_app_warning_count(
  target_app_id TEXT,
  target_user_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.mendix_apps
  SET warning_count = warning_count + 1,
      updated_at = now()
  WHERE app_id = target_app_id 
    AND user_id = target_user_id;
END;
$$;

-- Create function to increment app error count
CREATE OR REPLACE FUNCTION public.increment_app_error_count(
  target_app_id TEXT,
  target_user_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.mendix_apps
  SET error_count = error_count + 1,
      updated_at = now()
  WHERE app_id = target_app_id 
    AND user_id = target_user_id;
END;
$$;

-- Create function to increment environment counts
CREATE OR REPLACE FUNCTION public.increment_environment_counts(
  target_app_id TEXT,
  target_environment TEXT,
  target_level TEXT,
  target_user_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF target_level = 'Warning' THEN
    UPDATE public.mendix_environments
    SET warning_count = warning_count + 1,
        updated_at = now()
    WHERE app_id = target_app_id 
      AND environment_name = target_environment
      AND user_id = target_user_id;
  ELSIF target_level IN ('Error', 'Critical') THEN
    -- Add error_count column if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'mendix_environments' 
      AND column_name = 'error_count'
    ) THEN
      ALTER TABLE public.mendix_environments ADD COLUMN error_count INTEGER DEFAULT 0;
    END IF;
    
    UPDATE public.mendix_environments
    SET error_count = COALESCE(error_count, 0) + 1,
        updated_at = now()
    WHERE app_id = target_app_id 
      AND environment_name = target_environment
      AND user_id = target_user_id;
  END IF;
END;
$$;