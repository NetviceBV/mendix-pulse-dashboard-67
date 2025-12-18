-- Insert A09 OWASP step for Security Logging and Monitoring Failures
-- First, get the owasp_item_id for A09 and insert for all users who have it
INSERT INTO public.owasp_steps (
  user_id,
  owasp_item_id,
  step_name,
  step_description,
  edge_function_name,
  step_order,
  is_active,
  needs_railway_analysis
)
SELECT 
  oi.user_id,
  oi.id,
  'Log Monitoring Configuration Check',
  'Verifies that security logging and monitoring is enabled for production environment and email alerts are configured to detect and respond to security incidents.',
  'owasp-check-a09-log-monitoring',
  1,
  true,
  false
FROM public.owasp_items oi
WHERE oi.owasp_id = 'A09'
ON CONFLICT DO NOTHING;

-- Add A09 edge function to edge_functions initialization
CREATE OR REPLACE FUNCTION public.initialize_edge_functions(target_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.edge_functions (user_id, function_name, display_name, description, category, is_owasp_compatible)
  VALUES
    -- Mendix Operations
    (target_user_id, 'download-mendix-logs', 'Download Logs', 'Download log files from Mendix environments', 'mendix', true),
    (target_user_id, 'fetch-mendix-apps', 'Fetch Applications', 'Retrieve all Mendix applications and environments', 'mendix', false),
    (target_user_id, 'get-mendix-branches', 'Get Branches', 'List Git branches for a Mendix application', 'mendix', true),
    (target_user_id, 'get-mendix-commits', 'Get Commits', 'Retrieve commit history for a branch', 'mendix', true),
    (target_user_id, 'get-mendix-microflows', 'Get Microflows', 'List all microflows in the application', 'mendix', true),
    (target_user_id, 'get-mendix-packages', 'Get Packages', 'Retrieve deployment packages', 'mendix', true),
    (target_user_id, 'refresh-mendix-environment-status', 'Refresh Status', 'Update environment status information', 'mendix', true),
    (target_user_id, 'start-mendix-environment', 'Start Environment', 'Start a Mendix environment', 'mendix', false),
    (target_user_id, 'stop-mendix-environment', 'Stop Environment', 'Stop a Mendix environment', 'mendix', false),
    
    -- Security & Monitoring
    (target_user_id, 'monitor-environment-logs', 'Monitor Logs', 'Monitor environment logs for issues', 'security', true),
    (target_user_id, 'vulnerability-scan-environment', 'Vulnerability Scan', 'Scan environment for security vulnerabilities', 'security', true),
    
    -- Cloud Actions
    (target_user_id, 'cloud-action-orchestrator', 'Action Orchestrator', 'Orchestrate cloud action workflows', 'automation', false),
    (target_user_id, 'cloud-action-steps', 'Action Steps', 'Execute individual cloud action steps', 'automation', false),
    (target_user_id, 'run-cloud-actions-v2', 'Run Cloud Actions', 'Execute cloud actions', 'automation', false),
    (target_user_id, 'run-cloud-actions-backup', 'Run Cloud Actions Backup', 'Backup execution for cloud actions', 'automation', false),
    (target_user_id, 'cleanup-stale-actions', 'Cleanup Actions', 'Remove stale cloud actions', 'automation', false),
    
    -- Notifications
    (target_user_id, 'send-email-mandrill', 'Send Email', 'Send email notifications via Mandrill', 'notification', false),
    (target_user_id, 'process-log-monitoring', 'Process Log Monitoring', 'Process log monitoring alerts', 'notification', false),
    
    -- OWASP Security Checks
    (target_user_id, 'run-owasp-checks', 'Run OWASP Checks', 'Orchestrates execution of OWASP security checks', 'owasp', false),
    (target_user_id, 'owasp-discovery-orchestrator', 'OWASP Discovery', 'Orchestrates domain model security checks (batched)', 'owasp', true),
    (target_user_id, 'owasp-check-endpoint-restdoc', 'Check REST-doc Endpoint', 'Checks if /rest-doc/ endpoint is publicly accessible', 'owasp', true),
    (target_user_id, 'owasp-check-railway-anonymous-entity', 'Check Anonymous Entity Access', 'Checks for anonymous entity access without XPath constraints using Railway', 'owasp', true),
    (target_user_id, 'owasp-check-manual-verification', 'A02 Manual URL Verification', 'Manual verification for Cryptographic Failures (A02) URLs', 'owasp', true),
    (target_user_id, 'owasp-check-a03-manual-verification', 'A03 Manual URL Verification', 'Manual verification for Injection prevention (A03) URLs', 'owasp', true),
    (target_user_id, 'owasp-check-a04-manual-verification', 'A04 Manual URL Verification', 'Manual verification for Insecure Design (A04) - threat modeling, secure design patterns', 'owasp', true),
    (target_user_id, 'owasp-check-a04-log-monitoring', 'A04 Log Monitoring Check', 'Verifies log monitoring is enabled for production and email alerts are configured', 'owasp', true),
    (target_user_id, 'owasp-check-a05-js-imports', 'A05 JavaScript Import Check', 'Scans index.html for non-vanilla Mendix JavaScript imports', 'owasp', true),
    (target_user_id, 'owasp-check-a06-vulnerabilities', 'A06 Vulnerability Check', 'Evaluates latest vulnerability scan results for production environment', 'owasp', true),
    (target_user_id, 'owasp-check-a07-auth-failures', 'A07 Auth Check', 'Evaluates SSO modules and password policy compliance via Railway analysis', 'owasp', true),
    (target_user_id, 'owasp-check-a08-integrity', 'A08 Integrity Check', 'Verifies software and data integrity for production environment', 'owasp', true),
    (target_user_id, 'owasp-check-a09-log-monitoring', 'A09 Log Monitoring Check', 'Verifies security logging and monitoring is enabled for production environment', 'owasp', true),
    
    -- System
    (target_user_id, 'keep-alive-heartbeat', 'Heartbeat', 'System health check', 'system', false),
    (target_user_id, 'webhook-mendix-logs', 'Webhook Logs', 'Receive webhook log data', 'system', false)
  ON CONFLICT (user_id, function_name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    is_owasp_compatible = EXCLUDED.is_owasp_compatible;
END;
$function$;