import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CloudAction = {
  id: string;
  user_id: string;
  credential_id: string;
  app_id: string;
  environment_name: string;
  action_type: "start" | "stop" | "restart" | "download_logs" | "refresh_status";
  status: string;
  scheduled_for: string | null;
  started_at: string | null;
  completed_at: string | null;
  payload: Record<string, unknown> | null;
};

type MendixCredential = {
  id: string;
  user_id: string;
  username: string;
  api_key: string | null;
  pat: string | null;
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Authenticate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");
    const jwt = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(jwt);
    if (authError || !user) throw new Error("Invalid authentication");

    const body = await req.json().catch(() => ({}));
    const { actionId, processAllDue = true } = body as {
      actionId?: string;
      processAllDue?: boolean;
    };

    // Fetch actions to process
    let actions: CloudAction[] = [];
    if (actionId) {
      const { data, error } = await supabase
        .from("cloud_actions")
        .select("*")
        .eq("id", actionId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (data) actions = [data as CloudAction];
    } else if (processAllDue) {
      const { data, error } = await supabase
        .from("cloud_actions")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "scheduled")
        .lte("scheduled_for", new Date().toISOString());
      if (error) throw error;
      actions = (data || []) as CloudAction[];
    }

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const action of actions) {
      processed++;

      // Safety: never operate on production environment
      if (action.environment_name.toLowerCase() === "production") {
        await supabase
          .from("cloud_actions")
          .update({ status: "failed", completed_at: new Date().toISOString(), error_message: "Operation blocked on production environment" })
          .eq("id", action.id)
          .eq("user_id", user.id);
        await supabase.from("cloud_action_logs").insert({
          user_id: user.id,
          action_id: action.id,
          level: "error",
          message: "Blocked operation on production environment",
        });
        failed++;
        continue;
      }

      // Mark as running
      await supabase
        .from("cloud_actions")
        .update({ status: "running", started_at: new Date().toISOString(), error_message: null })
        .eq("id", action.id)
        .eq("user_id", user.id);

      await supabase.from("cloud_action_logs").insert({
        user_id: user.id,
        action_id: action.id,
        level: "info",
        message: `Starting action: ${action.action_type} for ${action.app_id}/${action.environment_name}`,
      });

      try {
        // Load Mendix credentials
        const { data: creds, error: credError } = await supabase
          .from("mendix_credentials")
          .select("*")
          .eq("id", action.credential_id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (credError || !creds) throw new Error("Credentials not found");
        const credential = creds as MendixCredential;

        // Helper to call Mendix Deploy API
        const callMendix = async (method: "start" | "stop") => {
          const url = `https://deploy.mendix.com/api/1/apps/${encodeURIComponent(action.app_id)}/environments/${encodeURIComponent(action.environment_name)}/${method}`;
          const resp = await fetch(url, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Mendix-Username": credential.username,
              "Mendix-ApiKey": credential.api_key || credential.pat || "",
              "Content-Type": "application/json",
            },
          });
          if (!resp.ok) {
            const t = await resp.text();
            throw new Error(`${method} failed: ${resp.status} ${t}`);
          }
        };

        switch (action.action_type) {
          case "start":
            await callMendix("start");
            break;
          case "stop":
            await callMendix("stop");
            break;
          case "restart":
            await callMendix("stop");
            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: "Stop completed, starting...",
            });
            await callMendix("start");
            break;
          case "refresh_status": {
            // Try to find environment_id to call existing function (best-effort)
            const { data: env } = await supabase
              .from("mendix_environments")
              .select("environment_id")
              .eq("user_id", user.id)
              .eq("app_id", action.app_id)
              .eq("environment_name", action.environment_name)
              .maybeSingle();

            await supabase.functions.invoke("refresh-mendix-environment-status", {
              body: {
                credentialId: action.credential_id,
                appId: action.app_id,
                environmentId: env?.environment_id ?? null,
              },
              headers: { Authorization: `Bearer ${jwt}` },
            });
            break;
          }
          case "download_logs": {
            // Fire-and-forget for now
            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: "Download logs action requested (queue implementation TBD)",
            });
            break;
          }
          default:
            throw new Error(`Unknown action type: ${action.action_type}`);
        }

        await supabase
          .from("cloud_actions")
          .update({ status: "succeeded", completed_at: new Date().toISOString() })
          .eq("id", action.id)
          .eq("user_id", user.id);
        await supabase.from("cloud_action_logs").insert({
          user_id: user.id,
          action_id: action.id,
          level: "info",
          message: `Action ${action.action_type} completed successfully`,
        });
        succeeded++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await supabase
          .from("cloud_actions")
          .update({ status: "failed", completed_at: new Date().toISOString(), error_message: msg.slice(0, 1000) })
          .eq("id", action.id)
          .eq("user_id", user.id);
        await supabase.from("cloud_action_logs").insert({
          user_id: user.id,
          action_id: action.id,
          level: "error",
          message: msg,
        });
        failed++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed, succeeded, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("run-cloud-actions error", error);
    const message = (error as any)?.message ?? "Unexpected error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
