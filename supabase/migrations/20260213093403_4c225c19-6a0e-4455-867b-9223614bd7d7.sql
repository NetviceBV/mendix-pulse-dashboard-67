
CREATE TABLE public.linting_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  rule_id text NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  description text,
  severity text,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, rule_id)
);

ALTER TABLE public.linting_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own policies" ON public.linting_policies FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own policies" ON public.linting_policies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own policies" ON public.linting_policies FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own policies" ON public.linting_policies FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_linting_policies_updated_at
  BEFORE UPDATE ON public.linting_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
