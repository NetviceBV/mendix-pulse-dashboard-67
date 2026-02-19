// Shared types for Cloud Actions components

export interface CloudActionRow {
  id: string;
  user_id: string;
  credential_id: string;
  app_id: string;
  environment_name: string;
  action_type: string;
  status: string;
  scheduled_for: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  creator_email?: string;
  creator_name?: string;
  retry_until?: string | null;
  payload?: any;
  updated_at?: string;
}

export interface Credential {
  id: string;
  name: string;
  username?: string;
  api_key?: string | null;
  pat?: string | null;
}

export interface App {
  id: string;
  app_id: string;
  app_name: string;
  credential_id: string;
  project_id: string;
}

export interface Env {
  id: string;
  app_id: string;
  environment_name: string;
}

export const statusColor: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  running: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  succeeded: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  canceled: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  error: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};
