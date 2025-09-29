// Centralized Supabase configuration
export const SUPABASE_CONFIG = {
  url: "https://mucojbkzmpmkcivoxrze.supabase.co",
  projectId: "mucojbkzmpmkcivoxrze",
  
  // Edge function URLs
  webhookUrl: "https://mucojbkzmpmkcivoxrze.supabase.co/functions/v1/webhook-mendix-logs",
  
  // Other endpoints can be added here as needed
  functionsUrl: "https://mucojbkzmpmkcivoxrze.supabase.co/functions/v1",
} as const;
