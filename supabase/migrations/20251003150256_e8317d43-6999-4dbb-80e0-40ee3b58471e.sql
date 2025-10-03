-- Create owasp_async_jobs table for background job processing
CREATE TABLE public.owasp_async_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  run_id UUID REFERENCES public.owasp_check_runs(id) ON DELETE CASCADE,
  step_id UUID REFERENCES public.owasp_steps(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued',
  result JSONB,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add job_id to owasp_check_results for tracking async jobs
ALTER TABLE public.owasp_check_results 
ADD COLUMN job_id UUID REFERENCES public.owasp_async_jobs(id) ON DELETE SET NULL;

-- Enable RLS on owasp_async_jobs
ALTER TABLE public.owasp_async_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for owasp_async_jobs
CREATE POLICY "Users can view their own async jobs"
ON public.owasp_async_jobs
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own async jobs"
ON public.owasp_async_jobs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can update async jobs"
ON public.owasp_async_jobs
FOR UPDATE
USING (auth.role() = 'service_role' OR auth.uid() = user_id);

-- Create index for efficient job processing
CREATE INDEX idx_owasp_async_jobs_status ON public.owasp_async_jobs(status, created_at);
CREATE INDEX idx_owasp_async_jobs_user_id ON public.owasp_async_jobs(user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_owasp_async_jobs_updated_at
BEFORE UPDATE ON public.owasp_async_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();