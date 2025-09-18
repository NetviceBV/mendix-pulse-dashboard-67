-- Create log monitoring settings table
CREATE TABLE public.log_monitoring_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  environment_id UUID NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  email_address TEXT NOT NULL,
  check_interval_minutes INTEGER NOT NULL DEFAULT 30,
  last_check_time TIMESTAMP WITH TIME ZONE DEFAULT now(),
  error_threshold INTEGER NOT NULL DEFAULT 1,
  critical_threshold INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, environment_id)
);

-- Create log monitoring alerts table
CREATE TABLE public.log_monitoring_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  environment_id UUID NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('error', 'critical')),
  log_entries_count INTEGER NOT NULL DEFAULT 0,
  log_content TEXT NOT NULL,
  email_sent BOOLEAN NOT NULL DEFAULT false,
  email_sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.log_monitoring_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.log_monitoring_alerts ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for log_monitoring_settings
CREATE POLICY "Users can view their own monitoring settings"
ON public.log_monitoring_settings
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own monitoring settings"
ON public.log_monitoring_settings
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own monitoring settings"
ON public.log_monitoring_settings
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own monitoring settings"
ON public.log_monitoring_settings
FOR DELETE
USING (auth.uid() = user_id);

-- Create RLS policies for log_monitoring_alerts
CREATE POLICY "Users can view their own monitoring alerts"
ON public.log_monitoring_alerts
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own monitoring alerts"
ON public.log_monitoring_alerts
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Add triggers for updated_at
CREATE TRIGGER update_log_monitoring_settings_updated_at
BEFORE UPDATE ON public.log_monitoring_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add indexes for performance
CREATE INDEX idx_log_monitoring_settings_user_enabled 
ON public.log_monitoring_settings(user_id, is_enabled);

CREATE INDEX idx_log_monitoring_alerts_user_created 
ON public.log_monitoring_alerts(user_id, created_at DESC);