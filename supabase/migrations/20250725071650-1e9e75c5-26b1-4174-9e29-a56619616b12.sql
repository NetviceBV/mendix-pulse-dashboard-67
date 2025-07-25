-- Create mendix_apps table to store retrieved applications
CREATE TABLE public.mendix_apps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  credential_id UUID NOT NULL REFERENCES public.mendix_credentials(id) ON DELETE CASCADE,
  app_name TEXT NOT NULL,
  app_url TEXT,
  project_id TEXT,
  app_id TEXT,
  status TEXT DEFAULT 'unknown',
  environment TEXT DEFAULT 'unknown',
  version TEXT,
  active_users INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  last_deployed TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.mendix_apps ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own apps" 
ON public.mendix_apps 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own apps" 
ON public.mendix_apps 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own apps" 
ON public.mendix_apps 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own apps" 
ON public.mendix_apps 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_mendix_apps_updated_at
BEFORE UPDATE ON public.mendix_apps
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for efficient querying
CREATE INDEX idx_mendix_apps_user_id ON public.mendix_apps(user_id);
CREATE INDEX idx_mendix_apps_credential_id ON public.mendix_apps(credential_id);