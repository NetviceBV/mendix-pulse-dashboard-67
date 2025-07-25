-- Create mendix_credentials table
CREATE TABLE public.mendix_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  username TEXT NOT NULL,
  api_key TEXT,
  pat TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.mendix_credentials ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for user isolation
CREATE POLICY "Users can view their own credentials" 
ON public.mendix_credentials 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own credentials" 
ON public.mendix_credentials 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own credentials" 
ON public.mendix_credentials 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own credentials" 
ON public.mendix_credentials 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_mendix_credentials_updated_at
BEFORE UPDATE ON public.mendix_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();