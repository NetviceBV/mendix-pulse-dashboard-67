-- Add needs_domain_model flag to identify which OWASP steps require domain model access
ALTER TABLE public.owasp_steps 
ADD COLUMN needs_domain_model BOOLEAN NOT NULL DEFAULT false;

-- Create index for efficient filtering of domain model steps
CREATE INDEX idx_owasp_steps_needs_model 
ON public.owasp_steps(needs_domain_model) 
WHERE needs_domain_model = true;

-- Update the existing anonymous entity check step to require domain model
UPDATE public.owasp_steps 
SET needs_domain_model = true 
WHERE edge_function_name = 'owasp-check-anonymous-entity-access-no-xpath';

-- Add comment explaining the optimization
COMMENT ON COLUMN public.owasp_steps.needs_domain_model IS 
'Indicates if this OWASP check requires opening the Mendix domain model. Steps marked true will be batched together for efficiency.';