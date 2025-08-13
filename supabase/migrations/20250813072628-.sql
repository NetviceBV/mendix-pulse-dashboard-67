-- 1) Create cloud_actions and cloud_action_logs tables with RLS, indexes, triggers

-- Extension required for gen_random_uuid
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- cloud_actions: records planned/scheduled actions against environments
CREATE TABLE IF NOT EXISTS public.cloud_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Linking data
  credential_id uuid NOT NULL,
  app_id text NOT NULL,
  environment_name text NOT NULL,
  -- Action details
  action_type text NOT NULL CHECK (action_type IN ('start','stop','restart','download_logs','refresh_status')),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','running','succeeded','failed','canceled')),
  scheduled_for timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  -- Optional parameters
  payload jsonb,
  -- Error field
  error_message text
);

-- cloud_action_logs: line-by-line logs for each action
CREATE TABLE IF NOT EXISTS public.cloud_action_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  level text NOT NULL DEFAULT 'info' CHECK (level IN ('debug','info','warn','error')),
  message text NOT NULL
);

-- RLS
ALTER TABLE public.cloud_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cloud_action_logs ENABLE ROW LEVEL SECURITY;

-- Policies for cloud_actions
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cloud_actions' AND policyname = 'Users can view their own cloud actions'
  ) THEN
    CREATE POLICY "Users can view their own cloud actions" ON public.cloud_actions
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cloud_actions' AND policyname = 'Users can create their own cloud actions'
  ) THEN
    CREATE POLICY "Users can create their own cloud actions" ON public.cloud_actions
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cloud_actions' AND policyname = 'Users can update their own cloud actions'
  ) THEN
    CREATE POLICY "Users can update their own cloud actions" ON public.cloud_actions
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cloud_actions' AND policyname = 'Users can delete their own cloud actions'
  ) THEN
    CREATE POLICY "Users can delete their own cloud actions" ON public.cloud_actions
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Policies for cloud_action_logs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cloud_action_logs' AND policyname = 'Users can view their own cloud action logs'
  ) THEN
    CREATE POLICY "Users can view their own cloud action logs" ON public.cloud_action_logs
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cloud_action_logs' AND policyname = 'Users can create their own cloud action logs'
  ) THEN
    CREATE POLICY "Users can create their own cloud action logs" ON public.cloud_action_logs
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cloud_actions_user_status_time ON public.cloud_actions (user_id, status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_cloud_actions_app_env ON public.cloud_actions (user_id, app_id, environment_name);
CREATE INDEX IF NOT EXISTS idx_cloud_action_logs_action_time ON public.cloud_action_logs (action_id, created_at);

-- Timestamp trigger function (reused across tables)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
DROP TRIGGER IF EXISTS trg_cloud_actions_updated_at ON public.cloud_actions;
CREATE TRIGGER trg_cloud_actions_updated_at
BEFORE UPDATE ON public.cloud_actions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
