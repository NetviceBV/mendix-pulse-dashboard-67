-- Create notification_email_addresses table
CREATE TABLE public.notification_email_addresses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  email_address TEXT NOT NULL,
  display_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  log_monitoring_enabled BOOLEAN NOT NULL DEFAULT false,
  cloud_action_notifications_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, email_address)
);

-- Enable Row Level Security
ALTER TABLE public.notification_email_addresses ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own notification emails" 
ON public.notification_email_addresses 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own notification emails" 
ON public.notification_email_addresses 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notification emails" 
ON public.notification_email_addresses 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notification emails" 
ON public.notification_email_addresses 
FOR DELETE 
USING (auth.uid() = user_id);

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_notification_email_addresses_updated_at
BEFORE UPDATE ON public.notification_email_addresses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Migrate existing email addresses from log_monitoring_settings
INSERT INTO public.notification_email_addresses (user_id, email_address, display_name, log_monitoring_enabled, is_active)
SELECT 
  user_id, 
  email_address, 
  'Migrated from Log Monitoring',
  true,
  true
FROM public.log_monitoring_settings 
WHERE email_address IS NOT NULL AND email_address != '';

-- Remove email_address column from log_monitoring_settings
ALTER TABLE public.log_monitoring_settings DROP COLUMN IF EXISTS email_address;