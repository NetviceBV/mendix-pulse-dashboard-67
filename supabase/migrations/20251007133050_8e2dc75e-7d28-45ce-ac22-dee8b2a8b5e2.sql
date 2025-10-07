-- Add unique constraint to owasp_check_results to enable proper upserts
-- This allows us to update check results when aggregating batch job results

ALTER TABLE public.owasp_check_results
ADD CONSTRAINT owasp_check_results_run_step_unique 
UNIQUE (run_id, owasp_step_id);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_owasp_check_results_run_status 
ON public.owasp_check_results(run_id, status);

-- Clean up any existing stuck 'pending' records for completed runs
-- Set them to 'pass' if the run overall passed, 'fail' if it failed
UPDATE public.owasp_check_results ocr
SET 
  status = CASE 
    WHEN ocrun.overall_status = 'pass' THEN 'pass'
    WHEN ocrun.overall_status = 'fail' THEN 'fail'
    ELSE ocr.status
  END,
  details = CASE 
    WHEN ocr.status = 'pending' THEN 'Updated from pending after run completion'
    ELSE ocr.details
  END
FROM public.owasp_check_runs ocrun
WHERE ocr.run_id = ocrun.id
  AND ocr.status = 'pending'
  AND ocrun.overall_status IN ('pass', 'fail')
  AND ocrun.run_completed_at IS NOT NULL;