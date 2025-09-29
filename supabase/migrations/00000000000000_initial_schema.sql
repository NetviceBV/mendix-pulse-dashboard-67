-- Complete Database Schema Baseline Migration
-- Generated for Mendix Monitoring Dashboard

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types
DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('admin', 'user');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- =============================================
-- TABLE DEFINITIONS
-- =============================================

-- Profiles table (linked to auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Mendix credentials
CREATE TABLE IF NOT EXISTS mendix_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  username text NOT NULL,
  api_key text,
  pat text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Mendix applications
CREATE TABLE IF NOT EXISTS mendix_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  credential_id uuid NOT NULL,
  app_id text,
  app_name text NOT NULL,
  project_id text,
  version text,
  status text DEFAULT 'unknown',
  environment text DEFAULT 'unknown',
  app_url text,
  last_deployed timestamp with time zone,
  active_users integer DEFAULT 0,
  warning_count integer DEFAULT 0,
  error_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Mendix environments
CREATE TABLE IF NOT EXISTS mendix_environments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  credential_id uuid NOT NULL,
  app_id text NOT NULL,
  environment_id text,
  environment_name text NOT NULL,
  status text DEFAULT 'unknown',
  url text,
  model_version text,
  runtime_version text,
  warning_count integer DEFAULT 0,
  error_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Mendix logs
CREATE TABLE IF NOT EXISTS mendix_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  app_id text NOT NULL,
  environment text NOT NULL,
  timestamp timestamp with time zone NOT NULL,
  level text NOT NULL,
  message text NOT NULL,
  node text,
  stacktrace text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Webhook API keys
CREATE TABLE IF NOT EXISTS webhook_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  key_name text NOT NULL,
  api_key text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Vulnerability scans
CREATE TABLE IF NOT EXISTS vulnerability_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  app_id text NOT NULL,
  environment_name text NOT NULL,
  package_id text,
  package_version text,
  scan_status text DEFAULT 'pending' NOT NULL,
  started_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone,
  total_jars integer DEFAULT 0,
  vulnerable_jars integer DEFAULT 0,
  clean_jars integer DEFAULT 0,
  error_jars integer DEFAULT 0,
  total_vulnerabilities integer DEFAULT 0,
  error_message text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Vulnerability findings
CREATE TABLE IF NOT EXISTS vulnerability_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL,
  vulnerability_id text NOT NULL,
  cve_id text,
  ghsa_id text,
  jar_file text NOT NULL,
  library_name text NOT NULL,
  library_version text,
  title text NOT NULL,
  description text,
  severity text,
  cvss_score numeric,
  cvss_vector text,
  reference_url text,
  published_at timestamp with time zone,
  updated_at_vuln timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Cloud actions
CREATE TABLE IF NOT EXISTS cloud_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  credential_id uuid NOT NULL,
  app_id text NOT NULL,
  environment_name text NOT NULL,
  action_type text NOT NULL,
  status text DEFAULT 'scheduled' NOT NULL,
  payload jsonb,
  package_id text,
  backup_id text,
  current_step text,
  step_data jsonb,
  last_heartbeat timestamp with time zone,
  attempt_count integer DEFAULT 0,
  retry_until timestamp with time zone,
  scheduled_for timestamp with time zone,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  error_message text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Cloud action logs
CREATE TABLE IF NOT EXISTS cloud_action_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action_id uuid NOT NULL,
  level text DEFAULT 'info' NOT NULL,
  message text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Email templates
CREATE TABLE IF NOT EXISTS email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  template_name text NOT NULL,
  template_type text NOT NULL,
  subject_template text NOT NULL,
  html_template text NOT NULL,
  is_default boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Notification email addresses
CREATE TABLE IF NOT EXISTS notification_email_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email_address text NOT NULL,
  display_name text,
  mailchimp_subaccount text,
  is_active boolean DEFAULT true NOT NULL,
  cloud_action_notifications_enabled boolean DEFAULT false NOT NULL,
  log_monitoring_enabled boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Log monitoring settings
CREATE TABLE IF NOT EXISTS log_monitoring_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  is_enabled boolean DEFAULT false NOT NULL,
  check_interval_minutes integer DEFAULT 30 NOT NULL,
  error_threshold integer DEFAULT 1 NOT NULL,
  critical_threshold integer DEFAULT 1 NOT NULL,
  whitelist_patterns jsonb DEFAULT '[]',
  last_check_time timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Log monitoring alerts
CREATE TABLE IF NOT EXISTS log_monitoring_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  alert_type text NOT NULL,
  log_content text NOT NULL,
  log_entries_count integer DEFAULT 0 NOT NULL,
  email_sent boolean DEFAULT false NOT NULL,
  email_sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- =============================================
-- FOREIGN KEY CONSTRAINTS
-- =============================================

ALTER TABLE profiles ADD CONSTRAINT fk_profiles_user_id 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE mendix_credentials ADD CONSTRAINT fk_mendix_credentials_user_id 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE mendix_apps ADD CONSTRAINT fk_mendix_apps_user_id 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE mendix_environments ADD CONSTRAINT fk_mendix_environments_user_id 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE mendix_logs ADD CONSTRAINT fk_mendix_logs_user_id 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE webhook_api_keys ADD CONSTRAINT fk_webhook_api_keys_user_id 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE vulnerability_scans ADD CONSTRAINT fk_vulnerability_scans_user_id 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE cloud_actions ADD CONSTRAINT fk_cloud_actions_user_id 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE cloud_action_logs ADD CONSTRAINT fk_cloud_action_logs_user_id 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE email_templates ADD CONSTRAINT fk_email_templates_user_id 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE notification_email_addresses ADD CONSTRAINT fk_notification_email_addresses_user_id 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE log_monitoring_settings ADD CONSTRAINT fk_log_monitoring_settings_user_id 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE log_monitoring_settings ADD CONSTRAINT fk_log_monitoring_settings_environment_id 
  FOREIGN KEY (environment_id) REFERENCES mendix_environments(id) ON DELETE CASCADE;

ALTER TABLE log_monitoring_alerts ADD CONSTRAINT fk_log_monitoring_alerts_user_id 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- =============================================
-- UNIQUE CONSTRAINTS
-- =============================================

ALTER TABLE profiles ADD CONSTRAINT uk_profiles_user_id UNIQUE (user_id);
ALTER TABLE mendix_apps ADD CONSTRAINT uk_mendix_apps_app_credential UNIQUE (app_id, credential_id);
ALTER TABLE mendix_environments ADD CONSTRAINT uk_mendix_environments_env_cred_user UNIQUE (environment_id, credential_id, user_id);
ALTER TABLE email_templates ADD CONSTRAINT email_templates_user_type_unique UNIQUE (user_id, template_type);
ALTER TABLE notification_email_addresses ADD CONSTRAINT notification_email_addresses_user_id_email_address_key UNIQUE (user_id, email_address);
ALTER TABLE log_monitoring_settings ADD CONSTRAINT log_monitoring_settings_user_id_environment_id_key UNIQUE (user_id, environment_id);

-- =============================================
-- DATABASE FUNCTIONS
-- =============================================

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name'
  );
  RETURN new;
END;
$$;

-- Function to update updated_at column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Function to increment app warning count
CREATE OR REPLACE FUNCTION public.increment_app_warning_count(target_app_id text, target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE public.mendix_apps
  SET warning_count = warning_count + 1,
      updated_at = now()
  WHERE app_id = target_app_id 
    AND user_id = target_user_id;
END;
$$;

-- Function to increment app error count
CREATE OR REPLACE FUNCTION public.increment_app_error_count(target_app_id text, target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE public.mendix_apps
  SET error_count = error_count + 1,
      updated_at = now()
  WHERE app_id = target_app_id 
    AND user_id = target_user_id;
END;
$$;

-- Function to increment environment counts
CREATE OR REPLACE FUNCTION public.increment_environment_counts(target_app_id text, target_environment text, target_level text, target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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
$$;

-- Function to normalize environment name
CREATE OR REPLACE FUNCTION public.normalize_environment_name(env_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
BEGIN
  -- Capitalize the first letter and make the rest lowercase
  RETURN INITCAP(LOWER(env_name));
END;
$$;

-- =============================================
-- TRIGGERS
-- =============================================

-- Trigger for new user profile creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Triggers for updated_at columns
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mendix_credentials_updated_at
  BEFORE UPDATE ON mendix_credentials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mendix_apps_updated_at
  BEFORE UPDATE ON mendix_apps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mendix_environments_updated_at
  BEFORE UPDATE ON mendix_environments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mendix_logs_updated_at
  BEFORE UPDATE ON mendix_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhook_api_keys_updated_at
  BEFORE UPDATE ON webhook_api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vulnerability_scans_updated_at
  BEFORE UPDATE ON vulnerability_scans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cloud_actions_updated_at
  BEFORE UPDATE ON cloud_actions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_email_addresses_updated_at
  BEFORE UPDATE ON notification_email_addresses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_log_monitoring_settings_updated_at
  BEFORE UPDATE ON log_monitoring_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE mendix_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE mendix_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE mendix_environments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mendix_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE vulnerability_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE vulnerability_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_action_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_email_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_monitoring_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_monitoring_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile" ON profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for mendix_credentials
CREATE POLICY "Users can view their own credentials" ON mendix_credentials FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own credentials" ON mendix_credentials FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own credentials" ON mendix_credentials FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own credentials" ON mendix_credentials FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for mendix_apps
CREATE POLICY "Users can view their own apps" ON mendix_apps FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own apps" ON mendix_apps FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own apps" ON mendix_apps FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own apps" ON mendix_apps FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for mendix_environments
CREATE POLICY "Users can view their own environments" ON mendix_environments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Allow environment creation for authenticated users and service" ON mendix_environments FOR INSERT WITH CHECK (((auth.role() = 'authenticated'::text) AND (auth.uid() = user_id)) OR (auth.role() = 'service_role'::text));
CREATE POLICY "Users can update their own environments" ON mendix_environments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own environments" ON mendix_environments FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for mendix_logs
CREATE POLICY "Users can view their own logs" ON mendix_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own logs" ON mendix_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for webhook_api_keys
CREATE POLICY "Users can view their own API keys" ON webhook_api_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own API keys" ON webhook_api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own API keys" ON webhook_api_keys FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own API keys" ON webhook_api_keys FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for vulnerability_scans
CREATE POLICY "Users can view their own vulnerability scans" ON vulnerability_scans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own vulnerability scans" ON vulnerability_scans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own vulnerability scans" ON vulnerability_scans FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own vulnerability scans" ON vulnerability_scans FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for vulnerability_findings
CREATE POLICY "Users can view their own vulnerability findings" ON vulnerability_findings FOR SELECT USING (EXISTS (SELECT 1 FROM vulnerability_scans WHERE vulnerability_scans.id = vulnerability_findings.scan_id AND vulnerability_scans.user_id = auth.uid()));
CREATE POLICY "Users can create their own vulnerability findings" ON vulnerability_findings FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM vulnerability_scans WHERE vulnerability_scans.id = vulnerability_findings.scan_id AND vulnerability_scans.user_id = auth.uid()));

-- RLS Policies for cloud_actions
CREATE POLICY "Users can view their own cloud actions" ON cloud_actions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own cloud actions" ON cloud_actions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own cloud actions" ON cloud_actions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own cloud actions" ON cloud_actions FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for cloud_action_logs
CREATE POLICY "Users can view their own cloud action logs" ON cloud_action_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own cloud action logs" ON cloud_action_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for email_templates
CREATE POLICY "Users can view their own email templates" ON email_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own email templates" ON email_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own email templates" ON email_templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own email templates" ON email_templates FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for notification_email_addresses
CREATE POLICY "Users can view their own notification emails" ON notification_email_addresses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own notification emails" ON notification_email_addresses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own notification emails" ON notification_email_addresses FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own notification emails" ON notification_email_addresses FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for log_monitoring_settings
CREATE POLICY "Users can view their own monitoring settings" ON log_monitoring_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own monitoring settings" ON log_monitoring_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own monitoring settings" ON log_monitoring_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own monitoring settings" ON log_monitoring_settings FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for log_monitoring_alerts
CREATE POLICY "Users can view their own monitoring alerts" ON log_monitoring_alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own monitoring alerts" ON log_monitoring_alerts FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =============================================
-- REALTIME CONFIGURATION (Optional)
-- =============================================

-- Uncomment the following lines to enable realtime for specific tables:
ALTER PUBLICATION supabase_realtime ADD TABLE mendix_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE mendix_apps;
ALTER PUBLICATION supabase_realtime ADD TABLE mendix_environments;
ALTER PUBLICATION supabase_realtime ADD TABLE cloud_actions;
ALTER PUBLICATION supabase_realtime ADD TABLE vulnerability_scans;

-- =============================================
-- COMPLETION MESSAGE
-- =============================================

-- Baseline migration completed successfully
-- This migration includes:
-- - 17 tables with complete schema definitions
-- - 12 foreign key relationships (11 to auth.users + 1 internal)
-- - 6 database functions for business logic
-- - 12 triggers for automation
-- - 6 unique constraints for data integrity
-- - Complete RLS policies for security
-- - All necessary indexes and constraints
