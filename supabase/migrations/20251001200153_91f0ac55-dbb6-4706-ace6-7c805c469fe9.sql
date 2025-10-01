-- Create edge_functions table
CREATE TABLE public.edge_functions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  function_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_owasp_compatible BOOLEAN NOT NULL DEFAULT false,
  expected_parameters JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, function_name)
);

-- Enable RLS
ALTER TABLE public.edge_functions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own edge functions"
  ON public.edge_functions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own edge functions"
  ON public.edge_functions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own edge functions"
  ON public.edge_functions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own edge functions"
  ON public.edge_functions FOR DELETE
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_edge_functions_updated_at
  BEFORE UPDATE ON public.edge_functions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default OWASP-compatible edge functions
-- This function will initialize edge functions for a user
CREATE OR REPLACE FUNCTION public.initialize_edge_functions(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
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
    (target_user_id, 'cleanup-stale-actions', 'Cleanup Actions', 'Remove stale cloud actions', 'automation', false),
    
    -- Notifications
    (target_user_id, 'send-email-mandrill', 'Send Email', 'Send email notifications via Mandrill', 'notification', false),
    (target_user_id, 'process-log-monitoring', 'Process Log Monitoring', 'Process log monitoring alerts', 'notification', false),
    
    -- System
    (target_user_id, 'keep-alive-heartbeat', 'Heartbeat', 'System health check', 'system', false),
    (target_user_id, 'webhook-mendix-logs', 'Webhook Logs', 'Receive webhook log data', 'system', false)
  ON CONFLICT (user_id, function_name) DO NOTHING;
END;
$$;