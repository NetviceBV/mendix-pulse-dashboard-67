-- Step 1: Create helper function to check app access (avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.user_has_app_access(check_user_id uuid, check_app_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM mendix_apps
    WHERE user_id = check_user_id
    AND project_id = check_app_id
  )
$$;

-- Step 2: Update cloud_actions RLS policies

-- DROP existing policies
DROP POLICY IF EXISTS "Users can view their own cloud actions" ON cloud_actions;
DROP POLICY IF EXISTS "Users can update their own cloud actions" ON cloud_actions;
DROP POLICY IF EXISTS "Users can delete their own cloud actions" ON cloud_actions;

-- CREATE new collaborative policies
CREATE POLICY "Users can view cloud actions for their apps"
ON cloud_actions
FOR SELECT
USING (
  auth.uid() = user_id 
  OR 
  public.user_has_app_access(auth.uid(), app_id)
);

CREATE POLICY "Users can update cloud actions for their apps"
ON cloud_actions
FOR UPDATE
USING (
  auth.uid() = user_id 
  OR 
  public.user_has_app_access(auth.uid(), app_id)
);

CREATE POLICY "Users can delete cloud actions for their apps"
ON cloud_actions
FOR DELETE
USING (
  auth.uid() = user_id 
  OR 
  public.user_has_app_access(auth.uid(), app_id)
);

-- Step 3: Update cloud_action_logs RLS policy

-- DROP existing policy
DROP POLICY IF EXISTS "Users can view their own cloud action logs" ON cloud_action_logs;

-- CREATE new collaborative policy
CREATE POLICY "Users can view cloud action logs for their apps"
ON cloud_action_logs
FOR SELECT
USING (
  auth.uid() = user_id 
  OR 
  EXISTS (
    SELECT 1 FROM cloud_actions ca
    WHERE ca.id = cloud_action_logs.action_id
    AND public.user_has_app_access(auth.uid(), ca.app_id)
  )
);