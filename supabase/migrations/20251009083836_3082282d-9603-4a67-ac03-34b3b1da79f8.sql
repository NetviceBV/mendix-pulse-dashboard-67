-- Add raw_response column to owasp_check_results for debugging Railway API responses
ALTER TABLE public.owasp_check_results 
ADD COLUMN raw_response JSONB;