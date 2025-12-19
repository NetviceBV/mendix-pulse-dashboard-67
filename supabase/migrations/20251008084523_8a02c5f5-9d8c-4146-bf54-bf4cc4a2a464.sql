-- Update A01 Step 2 to use Railway edge function
UPDATE owasp_steps
SET 
  edge_function_name = 'owasp-check-railway-anonymous-entity',
  needs_domain_model = false,
  step_description = 'Analyzes domain model for entities with anonymous access but no XPath constraints (processed via Railway)',
  updated_at = now()
WHERE 
  step_name = 'Check anonymous entity access'
  AND edge_function_name = 'owasp-check-anonymous-entity-access-no-xpath';

-- Register new Railway function in edge_functions table
INSERT INTO edge_functions (user_id, function_name, display_name, description, category, is_owasp_compatible, is_active)
SELECT DISTINCT 
  user_id,
  'owasp-check-railway-anonymous-entity' AS function_name,
  'Railway: Anonymous Entity Access Check' AS display_name,
  'Analyzes domain model via Railway app for entities with anonymous access and no XPath constraints' AS description,
  'owasp' AS category,
  true AS is_owasp_compatible,
  true AS is_active
FROM owasp_steps
WHERE step_name = 'Check anonymous entity access'
ON CONFLICT (user_id, function_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  is_active = true,
  updated_at = now();

-- Mark deprecated functions as inactive
UPDATE edge_functions
SET is_active = false, updated_at = now()
WHERE function_name IN (
  'owasp-discovery-orchestrator',
  'process-owasp-async-jobs',
  'owasp-check-anonymous-entity-access-no-xpath'
);

-- Delete owasp_async_jobs table (no longer needed with Railway integration)
DROP TABLE IF EXISTS owasp_async_jobs CASCADE;