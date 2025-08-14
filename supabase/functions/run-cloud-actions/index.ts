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
  action_type: "start" | "stop" | "restart" | "deploy" | "transport";
  status: string;
  scheduled_for: string | null;
  started_at: string | null;
  completed_at: string | null;
  retry_until: string | null;
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
          
          // Prepare request body - start requires AutoSyncDb parameter
          const body = method === "start" ? JSON.stringify({ "AutoSyncDb": true }) : "";
          
          await supabase.from("cloud_action_logs").insert({
            user_id: user.id,
            action_id: action.id,
            level: "info",
            message: `Calling Mendix API to ${method} environment ${action.environment_name}`,
          });

          const resp = await fetch(url, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Mendix-Username": credential.username,
              "Mendix-ApiKey": credential.api_key || credential.pat || "",
              "Content-Type": "application/json",
            },
            body: body,
          });

          if (!resp.ok) {
            let errorText;
            try {
              const contentType = resp.headers.get("content-type");
              if (contentType && contentType.includes("application/json")) {
                const errorData = await resp.json();
                errorText = errorData.message || errorData.error || JSON.stringify(errorData);
              } else {
                errorText = await resp.text();
              }
            } catch {
              errorText = `HTTP ${resp.status} ${resp.statusText}`;
            }
            throw new Error(`Failed to ${method} environment: ${errorText}`);
          }

          await supabase.from("cloud_action_logs").insert({
            user_id: user.id,
            action_id: action.id,
            level: "info",
            message: `Successfully ${method === "start" ? "started" : "stopped"} environment ${action.environment_name}`,
          });
        };

        // Helper to poll environment status until target status is reached
        const pollEnvironmentStatus = async (
          credentialId: string,
          appId: string,
          environmentName: string,
          targetStatus: string,
          retryUntil: Date,
          authToken: string
        ): Promise<boolean> => {
          let attempts = 0;
          const maxAttempts = 100; // Safety limit to prevent infinite loops
          
          console.log(`Starting to poll environment status for ${appId}/${environmentName}, target: ${targetStatus}, deadline: ${retryUntil.toISOString()}`);
          
          while (new Date() < retryUntil && attempts < maxAttempts) {
            attempts++;
            
            try {
              // Call refresh environment status function with environment name
              const { data: statusData, error: statusError } = await supabase.functions.invoke(
                "refresh-mendix-environment-status",
                {
                  headers: { Authorization: `Bearer ${authToken}` },
                  body: { credentialId, appId, environmentName },
                }
              );

              if (statusError) {
                console.error(`Status check failed (attempt ${attempts}):`, statusError);
                await supabase.from("cloud_action_logs").insert({
                  user_id: user.id,
                  action_id: action.id,
                  level: "warning",
                  message: `Status check failed (attempt ${attempts}): ${statusError.message || 'Unknown error'}`,
                });
                
                // Wait before retry on error
                await new Promise(resolve => setTimeout(resolve, 3000));
                continue;
              }

              const currentStatus = statusData?.environment?.status;
              const deadline = retryUntil.toISOString().substring(0, 19) + 'Z';
              
              console.log(`Poll attempt ${attempts}: Current status = ${currentStatus}, Target = ${targetStatus}`);
              
              await supabase.from("cloud_action_logs").insert({
                user_id: user.id,
                action_id: action.id,
                level: "info",
                message: `Polling environment status... Current: ${currentStatus}, Target: ${targetStatus} (deadline: ${deadline})`,
              });

              if (currentStatus?.toLowerCase() === targetStatus.toLowerCase()) {
                console.log(`Environment reached target status: ${targetStatus}`);
                await supabase.from("cloud_action_logs").insert({
                  user_id: user.id,
                  action_id: action.id,
                  level: "info",
                  message: `Environment successfully reached target status: ${targetStatus}`,
                });
                return true;
              }

              // Wait 3 seconds before next poll
              await new Promise(resolve => setTimeout(resolve, 3000));
              
            } catch (pollError) {
              console.error(`Polling error (attempt ${attempts}):`, pollError);
              await supabase.from("cloud_action_logs").insert({
                user_id: user.id,
                action_id: action.id,
                level: "error",
                message: `Polling error (attempt ${attempts}): ${pollError instanceof Error ? pollError.message : String(pollError)}`,
              });
              
              // Wait before retry on error
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
          }

          // Timeout reached
          const reason = attempts >= maxAttempts ? "maximum attempts reached" : "retry deadline reached";
          console.error(`Timeout waiting for environment status '${targetStatus}' - ${reason}`);
          await supabase.from("cloud_action_logs").insert({
            user_id: user.id,
            action_id: action.id,
            level: "error",
            message: `Timeout waiting for environment status '${targetStatus}' - ${reason}`,
          });
          
          return false;
        };

        switch (action.action_type) {
          case "start":
            await callMendix("start");
            break;
          case "stop":
            await callMendix("stop");
            break;
          case "restart":
            // Step 1: Stop the environment
            await callMendix("stop");
            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: "Stop command sent, waiting for environment to stop...",
            });
            
            // Step 2: Poll until stopped (with timeout based on retry_until)
            const retryUntil = action.retry_until ? new Date(action.retry_until) : new Date(Date.now() + 30 * 60 * 1000); // Default 30 minutes
            
            const stopSuccess = await pollEnvironmentStatus(
              action.credential_id,
              action.app_id,
              action.environment_name, // Using environment_name as environment_id
              "stopped",
              retryUntil,
              jwt
            );
            
            if (!stopSuccess) {
              throw new Error("Environment failed to stop within timeout period");
            }
            
            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: "Environment stopped, starting...",
            });
            
            // Step 3: Start the environment
            await callMendix("start");
            break;
          case "deploy":
            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: "Deploy action placeholder - implementation coming soon",
            });
            break;
          case "transport":
            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: "Transport action placeholder - implementation coming soon",
            });
            break;
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
