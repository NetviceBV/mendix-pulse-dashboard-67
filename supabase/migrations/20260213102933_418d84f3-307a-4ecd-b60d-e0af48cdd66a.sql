
CREATE TABLE public.linting_policy_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  app_id text NOT NULL,
  policy_id uuid REFERENCES public.linting_policies(id) ON DELETE CASCADE NOT NULL,
  is_enabled boolean NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, app_id, policy_id)
);

ALTER TABLE public.linting_policy_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own overrides"
ON public.linting_policy_overrides FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own overrides"
ON public.linting_policy_overrides FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own overrides"
ON public.linting_policy_overrides FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own overrides"
ON public.linting_policy_overrides FOR DELETE
USING (auth.uid() = user_id);

CREATE TRIGGER update_linting_policy_overrides_updated_at
BEFORE UPDATE ON public.linting_policy_overrides
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
