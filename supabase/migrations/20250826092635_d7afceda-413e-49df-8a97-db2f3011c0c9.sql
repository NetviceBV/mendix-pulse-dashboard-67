-- Update RLS policy for mendix_environments to allow service role insertions
-- This will ensure edge functions can insert environment data

-- Drop the existing INSERT policy
DROP POLICY IF EXISTS "Users can create their own environments" ON public.mendix_environments;

-- Create a new INSERT policy that allows both authenticated users and service role
CREATE POLICY "Allow environment creation for authenticated users and service" 
ON public.mendix_environments 
FOR INSERT 
WITH CHECK (
  -- Allow if user is authenticated and user_id matches auth.uid()
  (auth.role() = 'authenticated' AND auth.uid() = user_id)
  OR
  -- Allow service role (used by edge functions)
  auth.role() = 'service_role'
);