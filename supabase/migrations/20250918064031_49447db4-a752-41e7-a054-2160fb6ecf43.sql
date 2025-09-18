-- Migration: Complete database schema for Mendix Monitoring Dashboard
-- Description: Creates all tables, RLS policies, functions, and triggers

-- =============================================
-- TABLES SECTION
-- =============================================

-- Profiles table for user information
CREATE TABLE public.profiles (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    email text,
    full_name text,
    avatar_url text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Mendix credentials for API access
CREATE TABLE public.mendix_credentials (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    name text NOT NULL,
    username text NOT NULL,
    api_key text,
    pat text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Mendix applications
CREATE TABLE public.mendix_apps (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    credential_id uuid NOT NULL,
    app_id text,
    app_name text NOT NULL,
    project_id text,
    version text,
    status text DEFAULT 'unknown'::text,
    environment text DEFAULT 'unknown'::text,
    app_url text,
    last_deployed timestamp with time zone,
    active_users integer DEFAULT 0,
    warning_count integer DEFAULT 0,
    error_count integer DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Mendix environments
CREATE TABLE public.mendix_environments (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    credential_id uuid NOT NULL,
    app_id text NOT NULL,
    environment_id text,
    environment_name text NOT NULL,
    status text DEFAULT 'unknown'::text,
    url text,
    model_version text,
    runtime_version text,
    warning_count integer DEFAULT 0,
    error_count integer DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Mendix logs from webhooks
CREATE TABLE public.mendix_logs (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    app_id text NOT NULL,
    environment text NOT NULL,
    timestamp timestamp with time zone NOT NULL,
    level text NOT NULL,
    message text NOT NULL,
    node text,
    stacktrace text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Webhook API keys
CREATE TABLE public.webhook_api_keys (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    key_name text NOT NULL,
    api_key text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Vulnerability scans
CREATE TABLE public.vulnerability_scans (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    app_id text NOT NULL,
    environment_name text NOT NULL,
    package_id text,
    package_version text,
    scan_status text NOT NULL DEFAULT 'pending'::text,
    started_at timestamp with time zone NOT NULL DEFAULT now(),
    completed_at timestamp with time zone,
    error_message text,
    total_jars integer DEFAULT 0,
    vulnerable_jars integer DEFAULT 0,
    clean_jars integer DEFAULT 0,
    error_jars integer DEFAULT 0,
    total_vulnerabilities integer DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Vulnerability findings
CREATE TABLE public.vulnerability_findings (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    scan_id uuid NOT NULL,
    vulnerability_id text NOT NULL,
    title text NOT NULL,
    description text,
    cve_id text,
    ghsa_id text,
    reference_url text,
    cvss_score numeric,
    cvss_vector text,
    severity text,
    library_name text NOT NULL,
    library_version text,
    jar_file text NOT NULL,
    published_at timestamp with time zone,
    updated_at_vuln timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Cloud actions for scheduled operations
CREATE TABLE public.cloud_actions (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    credential_id uuid NOT NULL,
    app_id text NOT NULL,
    environment_name text NOT NULL,
    action_type text NOT NULL,
    status text NOT NULL DEFAULT 'scheduled'::text,
    payload jsonb,
    scheduled_for timestamp with time zone,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    retry_until timestamp with time zone,
    error_message text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Cloud action logs
CREATE TABLE public.cloud_action_logs (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    action_id uuid NOT NULL,
    level text NOT NULL DEFAULT 'info'::text,
    message text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Log monitoring settings
CREATE TABLE public.log_monitoring_settings (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    environment_id uuid NOT NULL,
    email_address text NOT NULL,
    is_enabled boolean NOT NULL DEFAULT false,
    check_interval_minutes integer NOT NULL DEFAULT 30,
    error_threshold integer NOT NULL DEFAULT 1,
    critical_threshold integer NOT NULL DEFAULT 1,
    last_check_time timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Log monitoring alerts
CREATE TABLE public.log_monitoring_alerts (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    environment_id uuid NOT NULL,
    alert_type text NOT NULL,
    log_content text NOT NULL,
    log_entries_count integer NOT NULL DEFAULT 0,
    email_sent boolean NOT NULL DEFAULT false,
    email_sent_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- =============================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mendix_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mendix_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mendix_environments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mendix_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vulnerability_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vulnerability_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cloud_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cloud_action_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.log_monitoring_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.log_monitoring_alerts ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Mendix credentials policies
CREATE POLICY "Users can view their own credentials" ON public.mendix_credentials FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own credentials" ON public.mendix_credentials FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own credentials" ON public.mendix_credentials FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own credentials" ON public.mendix_credentials FOR DELETE USING (auth.uid() = user_id);

-- Mendix apps policies
CREATE POLICY "Users can view their own apps" ON public.mendix_apps FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own apps" ON public.mendix_apps FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own apps" ON public.mendix_apps FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own apps" ON public.mendix_apps FOR DELETE USING (auth.uid() = user_id);

-- Mendix environments policies
CREATE POLICY "Users can view their own environments" ON public.mendix_environments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Allow environment creation for authenticated users and service" ON public.mendix_environments FOR INSERT WITH CHECK (((auth.role() = 'authenticated'::text) AND (auth.uid() = user_id)) OR (auth.role() = 'service_role'::text));
CREATE POLICY "Users can update their own environments" ON public.mendix_environments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own environments" ON public.mendix_environments FOR DELETE USING (auth.uid() = user_id);

-- Mendix logs policies
CREATE POLICY "Users can view their own logs" ON public.mendix_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own logs" ON public.mendix_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Webhook API keys policies
CREATE POLICY "Users can view their own API keys" ON public.webhook_api_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own API keys" ON public.webhook_api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own API keys" ON public.webhook_api_keys FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own API keys" ON public.webhook_api_keys FOR DELETE USING (auth.uid() = user_id);

-- Vulnerability scans policies
CREATE POLICY "Users can view their own vulnerability scans" ON public.vulnerability_scans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own vulnerability scans" ON public.vulnerability_scans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own vulnerability scans" ON public.vulnerability_scans FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own vulnerability scans" ON public.vulnerability_scans FOR DELETE USING (auth.uid() = user_id);

-- Vulnerability findings policies
CREATE POLICY "Users can view their own vulnerability findings" ON public.vulnerability_findings FOR SELECT USING (EXISTS (SELECT 1 FROM vulnerability_scans WHERE ((vulnerability_scans.id = vulnerability_findings.scan_id) AND (vulnerability_scans.user_id = auth.uid()))));
CREATE POLICY "Users can create their own vulnerability findings" ON public.vulnerability_findings FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM vulnerability_scans WHERE ((vulnerability_scans.id = vulnerability_findings.scan_id) AND (vulnerability_scans.user_id = auth.uid()))));

-- Cloud actions policies
CREATE POLICY "Users can view their own cloud actions" ON public.cloud_actions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own cloud actions" ON public.cloud_actions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own cloud actions" ON public.cloud_actions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own cloud actions" ON public.cloud_actions FOR DELETE USING (auth.uid() = user_id);

-- Cloud action logs policies
CREATE POLICY "Users can view their own cloud action logs" ON public.cloud_action_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own cloud action logs" ON public.cloud_action_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Log monitoring settings policies
CREATE POLICY "Users can view their own monitoring settings" ON public.log_monitoring_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own monitoring settings" ON public.log_monitoring_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own monitoring settings" ON public.log_monitoring_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own monitoring settings" ON public.log_monitoring_settings FOR DELETE USING (auth.uid() = user_id);

-- Log monitoring alerts policies
CREATE POLICY "Users can view their own monitoring alerts" ON public.log_monitoring_alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own monitoring alerts" ON public.log_monitoring_alerts FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =============================================
-- FUNCTIONS SECTION
-- =============================================

-- Function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name'
  );
  RETURN new;
END;
$function$;

-- Function to update updated_at column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- Function to increment app warning count
CREATE OR REPLACE FUNCTION public.increment_app_warning_count(target_app_id text, target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  UPDATE public.mendix_apps
  SET warning_count = warning_count + 1,
      updated_at = now()
  WHERE app_id = target_app_id 
    AND user_id = target_user_id;
END;
$function$;

-- Function to increment app error count
CREATE OR REPLACE FUNCTION public.increment_app_error_count(target_app_id text, target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  UPDATE public.mendix_apps
  SET error_count = error_count + 1,
      updated_at = now()
  WHERE app_id = target_app_id 
    AND user_id = target_user_id;
END;
$function$;

-- Function to increment environment counts
CREATE OR REPLACE FUNCTION public.increment_environment_counts(target_app_id text, target_environment text, target_level text, target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF target_level = 'Warning' THEN
    UPDATE public.mendix_environments
    SET warning_count = warning_count + 1,
        updated_at = now()
    WHERE app_id = target_app_id 
      AND environment_name = target_environment
      AND user_id = target_user_id;
  ELSIF target_level IN ('Error', 'Critical') THEN
    UPDATE public.mendix_environments
    SET error_count = COALESCE(error_count, 0) + 1,
        updated_at = now()
    WHERE app_id = target_app_id 
      AND environment_name = target_environment
      AND user_id = target_user_id;
  END IF;
END;
$function$;

-- =============================================
-- TRIGGERS SECTION
-- =============================================

-- Trigger to handle new user registration
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Triggers for updated_at columns
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_mendix_credentials_updated_at
  BEFORE UPDATE ON public.mendix_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_mendix_apps_updated_at
  BEFORE UPDATE ON public.mendix_apps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_mendix_environments_updated_at
  BEFORE UPDATE ON public.mendix_environments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_mendix_logs_updated_at
  BEFORE UPDATE ON public.mendix_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_webhook_api_keys_updated_at
  BEFORE UPDATE ON public.webhook_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vulnerability_scans_updated_at
  BEFORE UPDATE ON public.vulnerability_scans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cloud_actions_updated_at
  BEFORE UPDATE ON public.cloud_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_log_monitoring_settings_updated_at
  BEFORE UPDATE ON public.log_monitoring_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- CONSTRAINTS SECTION
-- =============================================

-- Unique constraints
ALTER TABLE public.mendix_apps ADD CONSTRAINT unique_app_credential UNIQUE (app_id, credential_id);
ALTER TABLE public.mendix_environments ADD CONSTRAINT unique_environment_credential UNIQUE (app_id, environment_name, credential_id);

-- =============================================
-- REALTIME CONFIGURATION
-- =============================================

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.mendix_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mendix_apps;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mendix_environments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cloud_actions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vulnerability_scans;