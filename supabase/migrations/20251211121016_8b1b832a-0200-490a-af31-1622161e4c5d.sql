-- Create table for storing manual verification URLs
CREATE TABLE public.owasp_manual_check_urls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  owasp_item_id UUID NOT NULL REFERENCES public.owasp_items(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, owasp_item_id, url)
);

-- Create table for tracking manual verifications per app/environment
CREATE TABLE public.owasp_manual_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  owasp_item_id UUID NOT NULL REFERENCES public.owasp_items(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL,
  environment_name TEXT NOT NULL DEFAULT 'Production',
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, owasp_item_id, app_id, environment_name)
);

-- Enable RLS on both tables
ALTER TABLE public.owasp_manual_check_urls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owasp_manual_verifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for owasp_manual_check_urls
CREATE POLICY "Users can view their own URLs"
ON public.owasp_manual_check_urls FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own URLs"
ON public.owasp_manual_check_urls FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own URLs"
ON public.owasp_manual_check_urls FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own URLs"
ON public.owasp_manual_check_urls FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for owasp_manual_verifications
CREATE POLICY "Users can view their own verifications"
ON public.owasp_manual_verifications FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own verifications"
ON public.owasp_manual_verifications FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own verifications"
ON public.owasp_manual_verifications FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own verifications"
ON public.owasp_manual_verifications FOR DELETE USING (auth.uid() = user_id);

-- Create triggers for updated_at
CREATE TRIGGER update_owasp_manual_check_urls_updated_at
BEFORE UPDATE ON public.owasp_manual_check_urls
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Update initialize_edge_functions to include new function
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
    (target_user_id, 'owasp-check-anonymous-entity-access-no-xpath', 'Check Anonymous Entity Access', 'Legacy - now handled by owasp-discovery-orchestrator', 'owasp', true),
    (target_user_id, 'owasp-check-manual-verification', 'Manual URL Verification', 'Checks if manual verification URLs have been reviewed within the expiration period', 'owasp', true),
    
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