
-- Create linting_runs table
CREATE TABLE public.linting_runs (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    app_id text NOT NULL,
    status text NOT NULL DEFAULT 'running'::text,
    total_rules integer DEFAULT 0,
    passed_rules integer DEFAULT 0,
    failed_rules integer DEFAULT 0,
    started_at timestamp with time zone NOT NULL DEFAULT now(),
    completed_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create linting_results table
CREATE TABLE public.linting_results (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    run_id uuid NOT NULL REFERENCES public.linting_runs(id) ON DELETE CASCADE,
    app_id text NOT NULL,
    chapter text NOT NULL,
    rule_name text NOT NULL,
    rule_description text,
    status text NOT NULL DEFAULT 'unknown'::text,
    details text,
    severity text DEFAULT 'info'::text,
    checked_at timestamp with time zone NOT NULL DEFAULT now(),
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.linting_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linting_results ENABLE ROW LEVEL SECURITY;

-- RLS policies for linting_runs
CREATE POLICY "Users can view their own linting runs" ON public.linting_runs
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own linting runs" ON public.linting_runs
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own linting runs" ON public.linting_runs
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own linting runs" ON public.linting_runs
    FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for linting_results
CREATE POLICY "Users can view their own linting results" ON public.linting_results
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own linting results" ON public.linting_results
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own linting results" ON public.linting_results
    FOR DELETE USING (auth.uid() = user_id);

-- Triggers for updated_at
CREATE TRIGGER update_linting_runs_updated_at
    BEFORE UPDATE ON public.linting_runs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.linting_runs;

-- Create index for faster lookups
CREATE INDEX idx_linting_results_run_id ON public.linting_results(run_id);
CREATE INDEX idx_linting_results_app_id ON public.linting_results(app_id);
CREATE INDEX idx_linting_runs_app_id ON public.linting_runs(app_id);
