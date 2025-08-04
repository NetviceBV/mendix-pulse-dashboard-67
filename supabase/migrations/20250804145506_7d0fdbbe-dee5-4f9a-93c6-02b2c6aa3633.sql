-- Create vulnerability scans table
CREATE TABLE public.vulnerability_scans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  app_id TEXT NOT NULL,
  environment_name TEXT NOT NULL,
  scan_status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  total_jars INTEGER DEFAULT 0,
  vulnerable_jars INTEGER DEFAULT 0,
  clean_jars INTEGER DEFAULT 0,
  error_jars INTEGER DEFAULT 0,
  total_vulnerabilities INTEGER DEFAULT 0,
  package_id TEXT,
  package_version TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create vulnerability findings table
CREATE TABLE public.vulnerability_findings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id UUID NOT NULL REFERENCES public.vulnerability_scans(id) ON DELETE CASCADE,
  jar_file TEXT NOT NULL,
  library_name TEXT NOT NULL,
  library_version TEXT,
  vulnerability_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  cvss_score DECIMAL(3,1),
  cvss_vector TEXT,
  severity TEXT,
  reference_url TEXT,
  published_at TIMESTAMP WITH TIME ZONE,
  updated_at_vuln TIMESTAMP WITH TIME ZONE,
  cve_id TEXT,
  ghsa_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on vulnerability_scans
ALTER TABLE public.vulnerability_scans ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for vulnerability_scans
CREATE POLICY "Users can view their own vulnerability scans" 
ON public.vulnerability_scans 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own vulnerability scans" 
ON public.vulnerability_scans 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own vulnerability scans" 
ON public.vulnerability_scans 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own vulnerability scans" 
ON public.vulnerability_scans 
FOR DELETE 
USING (auth.uid() = user_id);

-- Enable RLS on vulnerability_findings
ALTER TABLE public.vulnerability_findings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for vulnerability_findings
CREATE POLICY "Users can view their own vulnerability findings" 
ON public.vulnerability_findings 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.vulnerability_scans 
    WHERE vulnerability_scans.id = vulnerability_findings.scan_id 
    AND vulnerability_scans.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create their own vulnerability findings" 
ON public.vulnerability_findings 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.vulnerability_scans 
    WHERE vulnerability_scans.id = vulnerability_findings.scan_id 
    AND vulnerability_scans.user_id = auth.uid()
  )
);

-- Create indexes for better performance
CREATE INDEX idx_vulnerability_scans_user_id ON public.vulnerability_scans(user_id);
CREATE INDEX idx_vulnerability_scans_app_environment ON public.vulnerability_scans(app_id, environment_name);
CREATE INDEX idx_vulnerability_scans_status ON public.vulnerability_scans(scan_status);
CREATE INDEX idx_vulnerability_findings_scan_id ON public.vulnerability_findings(scan_id);
CREATE INDEX idx_vulnerability_findings_severity ON public.vulnerability_findings(severity);

-- Create trigger for automatic timestamp updates on vulnerability_scans
CREATE TRIGGER update_vulnerability_scans_updated_at
BEFORE UPDATE ON public.vulnerability_scans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for vulnerability_scans
ALTER TABLE public.vulnerability_scans REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vulnerability_scans;