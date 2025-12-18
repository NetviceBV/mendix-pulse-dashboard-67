-- Insert OWASP step for A08 (Software and Data Integrity Failures)
-- This step uses the owasp-check-a08-integrity edge function

INSERT INTO public.owasp_steps (
  user_id,
  owasp_item_id,
  step_name,
  step_description,
  edge_function_name,
  step_order,
  is_active,
  needs_domain_model,
  needs_railway_analysis
)
SELECT 
  oi.user_id,
  oi.id as owasp_item_id,
  'Software Integrity Check' as step_name,
  'Verifies software and data integrity: auto-passes for Mendix Cloud hosted apps, requires manual verification for self-hosted apps' as step_description,
  'owasp-check-a08-integrity' as edge_function_name,
  1 as step_order,
  true as is_active,
  false as needs_domain_model,
  false as needs_railway_analysis
FROM public.owasp_items oi
WHERE oi.owasp_id = 'A08'
ON CONFLICT DO NOTHING;

-- Also add the edge function to edge_functions table for users
INSERT INTO public.edge_functions (
  user_id,
  function_name,
  display_name,
  description,
  category,
  is_owasp_compatible
)
SELECT DISTINCT
  user_id,
  'owasp-check-a08-integrity',
  'A08 Integrity Check',
  'Checks software and data integrity: auto-passes for Mendix Cloud, requires manual verification for self-hosted',
  'owasp',
  true
FROM public.owasp_items
WHERE owasp_id = 'A08'
ON CONFLICT (user_id, function_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_owasp_compatible = EXCLUDED.is_owasp_compatible;