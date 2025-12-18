-- =============================================
-- A07 Railway Analysis Caching Infrastructure
-- =============================================

-- 1. Create railway_analysis_cache table to store Railway API responses
CREATE TABLE public.railway_analysis_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  project_id TEXT NOT NULL,
  run_id UUID NOT NULL,
  analysis_data JSONB NOT NULL,
  request_parameters JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '1 hour')
);

-- Add index for fast lookups by run_id
CREATE INDEX idx_railway_cache_run_id ON public.railway_analysis_cache(run_id);
CREATE INDEX idx_railway_cache_user_project ON public.railway_analysis_cache(user_id, project_id);

-- Enable RLS
ALTER TABLE public.railway_analysis_cache ENABLE ROW LEVEL SECURITY;

-- RLS policies for railway_analysis_cache
CREATE POLICY "Users can view their own cache entries"
ON public.railway_analysis_cache FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own cache entries"
ON public.railway_analysis_cache FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own cache entries"
ON public.railway_analysis_cache FOR DELETE
USING (auth.uid() = user_id);

-- 2. Create owasp_a07_settings table with app-level override support
CREATE TABLE public.owasp_a07_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  app_id TEXT DEFAULT NULL,  -- NULL for user defaults, value for app-specific override
  
  -- Password Policy settings
  minimum_length INTEGER DEFAULT 8,
  require_digit BOOLEAN DEFAULT true,
  require_symbol BOOLEAN DEFAULT true,
  require_mixed_case BOOLEAN DEFAULT true,
  
  -- SSO Patterns to detect
  sso_patterns JSONB DEFAULT '["saml20", "oidc", "keycloak", "azuread", "okta"]'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Allow one default (NULL app_id) per user + multiple app-specific overrides
  UNIQUE(user_id, app_id)
);

-- Index for fast lookups
CREATE INDEX idx_a07_settings_user_app ON public.owasp_a07_settings(user_id, app_id);

-- Enable RLS
ALTER TABLE public.owasp_a07_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for owasp_a07_settings
CREATE POLICY "Users can view their own A07 settings"
ON public.owasp_a07_settings FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own A07 settings"
ON public.owasp_a07_settings FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own A07 settings"
ON public.owasp_a07_settings FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own A07 settings"
ON public.owasp_a07_settings FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_owasp_a07_settings_updated_at
  BEFORE UPDATE ON public.owasp_a07_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Add needs_railway_analysis column to owasp_steps
ALTER TABLE public.owasp_steps 
ADD COLUMN IF NOT EXISTS needs_railway_analysis BOOLEAN DEFAULT false;

-- Mark existing A01 Railway step as needing Railway analysis
UPDATE public.owasp_steps 
SET needs_railway_analysis = true 
WHERE edge_function_name = 'owasp-check-railway-anonymous-entity';

-- 4. Update initialize_edge_functions to include A07 function
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