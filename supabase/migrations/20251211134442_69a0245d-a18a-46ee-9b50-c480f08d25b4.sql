-- Allow users to update their own OWASP check results
CREATE POLICY "Users can update their own OWASP check results"
ON public.owasp_check_results
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);