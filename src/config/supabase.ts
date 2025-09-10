// Centralized Supabase configuration
export const SUPABASE_CONFIG = {
  url: "https://hfmeoajwhaiobjngpyhe.supabase.co",
  projectId: "hfmeoajwhaiobjngpyhe",
  
  // Edge function URLs
  webhookUrl: "https://hfmeoajwhaiobjngpyhe.supabase.co/functions/v1/webhook-mendix-logs",
  
  // Other endpoints can be added here as needed
  functionsUrl: "https://hfmeoajwhaiobjngpyhe.supabase.co/functions/v1",
} as const;
