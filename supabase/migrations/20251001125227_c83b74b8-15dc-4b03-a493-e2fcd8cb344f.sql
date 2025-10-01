-- Create table for OWASP item definitions per tenant
CREATE TABLE public.owasp_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  owasp_id TEXT NOT NULL, -- e.g., "A01", "A02"
  title TEXT NOT NULL,
  description TEXT,
  expiration_months INTEGER NOT NULL DEFAULT 12,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, owasp_id)
);

-- Create table for steps per OWASP item
CREATE TABLE public.owasp_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  owasp_item_id UUID NOT NULL REFERENCES public.owasp_items(id) ON DELETE CASCADE,
  step_name TEXT NOT NULL,
  step_description TEXT,
  edge_function_name TEXT NOT NULL,
  step_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for check results per app
CREATE TABLE public.owasp_check_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  app_id TEXT NOT NULL,
  environment_name TEXT NOT NULL,
  owasp_step_id UUID NOT NULL REFERENCES public.owasp_steps(id) ON DELETE CASCADE,
  status TEXT NOT NULL, -- 'pass', 'fail', 'warning', 'error'
  details TEXT,
  checked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  execution_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.owasp_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owasp_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owasp_check_results ENABLE ROW LEVEL SECURITY;

-- RLS Policies for owasp_items
CREATE POLICY "Users can view their own OWASP items"
  ON public.owasp_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own OWASP items"
  ON public.owasp_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own OWASP items"
  ON public.owasp_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own OWASP items"
  ON public.owasp_items FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for owasp_steps
CREATE POLICY "Users can view their own OWASP steps"
  ON public.owasp_steps FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own OWASP steps"
  ON public.owasp_steps FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own OWASP steps"
  ON public.owasp_steps FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own OWASP steps"
  ON public.owasp_steps FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for owasp_check_results
CREATE POLICY "Users can view their own OWASP check results"
  ON public.owasp_check_results FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own OWASP check results"
  ON public.owasp_check_results FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own OWASP check results"
  ON public.owasp_check_results FOR DELETE
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_owasp_items_user_id ON public.owasp_items(user_id);
CREATE INDEX idx_owasp_steps_owasp_item_id ON public.owasp_steps(owasp_item_id);
CREATE INDEX idx_owasp_steps_user_id ON public.owasp_steps(user_id);
CREATE INDEX idx_owasp_check_results_app_id ON public.owasp_check_results(app_id, environment_name);
CREATE INDEX idx_owasp_check_results_user_id ON public.owasp_check_results(user_id);
CREATE INDEX idx_owasp_check_results_checked_at ON public.owasp_check_results(checked_at DESC);

-- Add triggers for automatic timestamp updates
CREATE TRIGGER update_owasp_items_updated_at
  BEFORE UPDATE ON public.owasp_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_owasp_steps_updated_at
  BEFORE UPDATE ON public.owasp_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to initialize default OWASP Top 10 items for a user
CREATE OR REPLACE FUNCTION public.initialize_default_owasp_items(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert default OWASP Top 10 2021 items
  INSERT INTO public.owasp_items (user_id, owasp_id, title, description, expiration_months)
  VALUES
    (target_user_id, 'A01', 'Broken Access Control', 'Access control enforces policy such that users cannot act outside of their intended permissions.', 6),
    (target_user_id, 'A02', 'Cryptographic Failures', 'Protect data in transit and at rest with strong cryptography.', 12),
    (target_user_id, 'A03', 'Injection', 'Validate, filter, and sanitize all user input.', 6),
    (target_user_id, 'A04', 'Insecure Design', 'Use secure design patterns and threat modeling.', 12),
    (target_user_id, 'A05', 'Security Misconfiguration', 'Implement secure configuration management.', 6),
    (target_user_id, 'A06', 'Vulnerable and Outdated Components', 'Keep all components up to date.', 3),
    (target_user_id, 'A07', 'Identification and Authentication Failures', 'Implement multi-factor authentication where possible.', 6),
    (target_user_id, 'A08', 'Software and Data Integrity Failures', 'Use digital signatures to verify software integrity.', 12),
    (target_user_id, 'A09', 'Security Logging and Monitoring Failures', 'Log security-relevant events and monitor for anomalies.', 6),
    (target_user_id, 'A10', 'Server-Side Request Forgery', 'Validate and sanitize all client-supplied URLs.', 6)
  ON CONFLICT (user_id, owasp_id) DO NOTHING;
END;
$$;