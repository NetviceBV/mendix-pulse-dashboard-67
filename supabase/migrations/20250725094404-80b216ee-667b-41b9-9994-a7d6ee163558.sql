-- Create mendix_environments table to store environment data
CREATE TABLE public.mendix_environments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  credential_id UUID NOT NULL REFERENCES public.mendix_credentials(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL,
  environment_id TEXT,
  environment_name TEXT NOT NULL,
  status TEXT DEFAULT 'unknown',
  url TEXT,
  model_version TEXT,
  runtime_version TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.mendix_environments ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own environments" 
ON public.mendix_environments 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own environments" 
ON public.mendix_environments 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own environments" 
ON public.mendix_environments 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own environments" 
ON public.mendix_environments 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_mendix_environments_updated_at
BEFORE UPDATE ON public.mendix_environments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for efficient querying
CREATE INDEX idx_mendix_environments_user_id ON public.mendix_environments(user_id);
CREATE INDEX idx_mendix_environments_app_id ON public.mendix_environments(app_id);
CREATE INDEX idx_mendix_environments_credential_id ON public.mendix_environments(credential_id);