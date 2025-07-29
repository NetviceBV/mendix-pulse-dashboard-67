-- Create mendix_logs table for real-time log entries
CREATE TABLE public.mendix_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  app_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  level TEXT NOT NULL,
  node TEXT,
  message TEXT NOT NULL,
  stacktrace TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.mendix_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own logs" 
ON public.mendix_logs 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own logs" 
ON public.mendix_logs 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_mendix_logs_updated_at
BEFORE UPDATE ON public.mendix_logs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add warning_count column to mendix_apps for tracking warnings
ALTER TABLE public.mendix_apps 
ADD COLUMN warning_count INTEGER DEFAULT 0;

-- Add warning_count to mendix_environments
ALTER TABLE public.mendix_environments 
ADD COLUMN warning_count INTEGER DEFAULT 0;

-- Create an index for better performance on log queries
CREATE INDEX idx_mendix_logs_app_env ON public.mendix_logs(app_id, environment, timestamp DESC);
CREATE INDEX idx_mendix_logs_level ON public.mendix_logs(level, timestamp DESC);
CREATE INDEX idx_mendix_logs_user_timestamp ON public.mendix_logs(user_id, timestamp DESC);

-- Enable realtime for the logs table
ALTER TABLE public.mendix_logs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mendix_logs;

-- Also enable realtime for existing tables to get live updates
ALTER TABLE public.mendix_apps REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mendix_apps;

ALTER TABLE public.mendix_environments REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mendix_environments;

-- Create table for webhook API keys
CREATE TABLE public.webhook_api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  key_name TEXT NOT NULL,
  api_key TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for API keys
ALTER TABLE public.webhook_api_keys ENABLE ROW LEVEL SECURITY;

-- Create policies for API keys
CREATE POLICY "Users can view their own API keys" 
ON public.webhook_api_keys 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own API keys" 
ON public.webhook_api_keys 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own API keys" 
ON public.webhook_api_keys 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own API keys" 
ON public.webhook_api_keys 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for API keys timestamp updates
CREATE TRIGGER update_webhook_api_keys_updated_at
BEFORE UPDATE ON public.webhook_api_keys
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();