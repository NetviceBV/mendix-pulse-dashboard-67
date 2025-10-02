-- Create owasp_check_runs table to track complete OWASP check runs
CREATE TABLE IF NOT EXISTS public.owasp_check_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  app_id TEXT NOT NULL,
  environment_name TEXT NOT NULL,
  run_started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  run_completed_at TIMESTAMP WITH TIME ZONE,
  overall_status TEXT NOT NULL DEFAULT 'running',
  total_checks INTEGER NOT NULL DEFAULT 0,
  passed_checks INTEGER NOT NULL DEFAULT 0,
  failed_checks INTEGER NOT NULL DEFAULT 0,
  warning_checks INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add RLS policies for owasp_check_runs
ALTER TABLE public.owasp_check_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own OWASP check runs"
  ON public.owasp_check_runs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own OWASP check runs"
  ON public.owasp_check_runs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own OWASP check runs"
  ON public.owasp_check_runs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own OWASP check runs"
  ON public.owasp_check_runs FOR DELETE
  USING (auth.uid() = user_id);

-- Add run_id column to owasp_check_results to link results to runs
ALTER TABLE public.owasp_check_results 
ADD COLUMN IF NOT EXISTS run_id UUID REFERENCES public.owasp_check_runs(id) ON DELETE CASCADE;

-- Add trigger for updated_at on owasp_check_runs
CREATE TRIGGER update_owasp_check_runs_updated_at
  BEFORE UPDATE ON public.owasp_check_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_owasp_check_runs_user_app 
  ON public.owasp_check_runs(user_id, app_id, run_started_at DESC);

CREATE INDEX IF NOT EXISTS idx_owasp_check_results_run_id 
  ON public.owasp_check_results(run_id);