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

// Add graceful shutdown handling
addEventListener('beforeunload', (ev) => {
  console.log('Function shutdown due to:', ev.detail?.reason);
});

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

    // Start background processing and return immediate response
    EdgeRuntime.waitUntil(processActionsInBackground(actions, user, supabase, jwt));

    return new Response(
      JSON.stringify({
        success: true,
        message: "Processing started",
        actionCount: actions.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error starting cloud actions:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Background processing function
async function processActionsInBackground(
  actions: CloudAction[],
  user: any,
  supabase: any,
  jwt: string
) {
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  console.log(`Background processing started for ${actions.length} actions`);

  for (const action of actions) {
    processed++;

    try {
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

      // Load Mendix credentials
      const { data: creds, error: credError } = await supabase
        .from("mendix_credentials")
        .select("*")
        .eq("id", action.credential_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (credError || !creds) throw new Error("Credentials not found");
      const credential = creds as MendixCredential;

      // Get project_id from mendix_apps table for v4 API calls
      const { data: appData, error: appError } = await supabase
        .from("mendix_apps")
        .select("project_id")
        .eq("app_id", action.app_id)
        .eq("credential_id", action.credential_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (appError || !appData?.project_id) {
        throw new Error(`Failed to get project_id for app ${action.app_id}: ${appError?.message}`);
      }

      const projectId = appData.project_id;

      // CRITICAL: Environment name normalization for Mendix API case sensitivity
      // Mendix Deploy API expects environment names with proper capitalization:
      // - "Production" (not "production")  
      // - "Acceptance" (not "acceptance")
      // - "Test" (not "test")
      const normalizeEnvironmentName = (envName: string): string => {
        const normalized = envName.toLowerCase();
        switch (normalized) {
          case 'production':
            return 'Production';
          case 'acceptance':
            return 'Acceptance';
          case 'test':
            return 'Test';
          default:
            // For custom environment names, capitalize first letter
            return envName.charAt(0).toUpperCase() + envName.slice(1).toLowerCase();
        }
      };

      const normalizedEnvironmentName = normalizeEnvironmentName(action.environment_name);
      
      await supabase.from("cloud_action_logs").insert({
        user_id: user.id,
        action_id: action.id,
        level: "info",
        message: `Using normalized environment name: "${normalizedEnvironmentName}" (original: "${action.environment_name}")`,
      });

      // Helper to call Mendix Deploy API
      const callMendix = async (method: "start" | "stop") => {
        const url = `https://deploy.mendix.com/api/1/apps/${encodeURIComponent(action.app_id)}/environments/${encodeURIComponent(normalizedEnvironmentName)}/${method}`;
        
        // Prepare request body - start requires AutoSyncDb parameter
        const body = method === "start" ? JSON.stringify({ "AutoSyncDb": true }) : "";
        
        await supabase.from("cloud_action_logs").insert({
          user_id: user.id,
          action_id: action.id,
          level: "info",
          message: `Calling Mendix API to ${method} environment ${normalizedEnvironmentName} (original: ${action.environment_name})`,
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
          message: `Successfully ${method === "start" ? "started" : "stopped"} environment ${normalizedEnvironmentName}`,
        });
      };

      // Helper to poll environment status until target status is reached
      const pollEnvironmentStatus = async (
        credentialId: string,
        appId: string,
        environmentName: string,
        targetStatus: string,
        retryUntil: Date,
        userId: string
      ): Promise<boolean> => {
        let attempts = 0;
        const maxAttempts = 100; // Safety limit to prevent infinite loops
        
        console.log(`Starting to poll environment status for ${appId}/${environmentName}, target: ${targetStatus}, deadline: ${retryUntil.toISOString()}`);
        
        while (new Date() < retryUntil && attempts < maxAttempts) {
          attempts++;
          
          try {
            // Call refresh environment status function with service role authentication
            const { data: statusData, error: statusError } = await supabase.functions.invoke(
              "refresh-mendix-environment-status",
              {
                body: { credentialId, appId, environmentName, userId },
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

      // Process the action based on type
      switch (action.action_type) {
        case "start":
          await callMendix("start");
          await supabase.from("cloud_action_logs").insert({
            user_id: user.id,
            action_id: action.id,
            level: "info",
            message: "Start command sent, waiting for environment to start...",
          });
          
          // Poll to verify environment started
          const startRetryUntil = action.retry_until ? new Date(action.retry_until) : new Date(Date.now() + 30 * 60 * 1000);
          const startActionSuccess = await pollEnvironmentStatus(
            action.credential_id,
            action.app_id,
            normalizedEnvironmentName,
            "running",
            startRetryUntil,
            action.user_id
          );
          
          if (!startActionSuccess) {
            throw new Error("Environment failed to start within timeout period");
          }
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
          
          // Step 2: Poll until stopped
          const restartRetryUntil = action.retry_until ? new Date(action.retry_until) : new Date(Date.now() + 30 * 60 * 1000);
          
          const restartStopSuccess = await pollEnvironmentStatus(
            action.credential_id,
            action.app_id,
            normalizedEnvironmentName,
            "stopped",
            restartRetryUntil,
            action.user_id
          );
          
          if (!restartStopSuccess) {
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
          
          await supabase.from("cloud_action_logs").insert({
            user_id: user.id,
            action_id: action.id,
            level: "info",
            message: "Start command sent, waiting for environment to start...",
          });
          
          // Poll to verify environment started
          const restartActionSuccess = await pollEnvironmentStatus(
            action.credential_id,
            action.app_id,
            normalizedEnvironmentName,
            "running",
            restartRetryUntil,
            action.user_id
          );
          
          if (!restartActionSuccess) {
            throw new Error("Environment failed to start within timeout period");
          }
          break;

        case "deploy":
          // Extract deploy parameters from payload
          const deployPayload = action.payload as { branchName?: string; revisionId?: string; version?: string; description?: string; comment?: string } || {};
          const { branchName, revisionId, version, description, comment: deployComment } = deployPayload;
          
          if (!branchName || !revisionId) {
            throw new Error("Branch name and revision are required for deploy action");
          }

          await supabase.from("cloud_action_logs").insert({
            user_id: user.id,
            action_id: action.id,
            level: "info",
            message: `Starting deploy from branch ${branchName}, revision ${revisionId} to ${action.environment_name}`,
          });

          const deployRetryUntil = action.retry_until ? new Date(action.retry_until) : new Date(Date.now() + 90 * 60 * 1000); // Default 90 minutes

          // Step 1: Create package from branch and revision
          await supabase.from("cloud_action_logs").insert({
            user_id: user.id,
            action_id: action.id,
            level: "info",
            message: `Creating package from branch: ${branchName}, revision: ${revisionId}`,
          });

          const createPackageUrl = `https://deploy.mendix.com/api/1/apps/${encodeURIComponent(action.app_id)}/packages`;
          const createPackageResp = await fetch(createPackageUrl, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Mendix-Username": credential.username,
              "Mendix-ApiKey": credential.api_key || credential.pat || "",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              Branch: branchName,
              Revision: revisionId,
              Version: version || `1.0.${Date.now()}`,
              Description: description || "PintosoftOps Deploy Package",
            }),
          });

          if (!createPackageResp.ok) {
            const errorText = await createPackageResp.text();
            throw new Error(`Failed to create package: ${errorText}`);
          }

          const createPackageData = await createPackageResp.json();
          const newPackageId = createPackageData.PackageId;

          await supabase.from("cloud_action_logs").insert({
            user_id: user.id,
            action_id: action.id,
            level: "info",
            message: `Package creation started: ${newPackageId}`,
          });

          // Poll for package build completion and transport logic
          let packageStatus = "Building";
          let packageBuildAttempts = 0;
          const maxPackageBuildAttempts = 60; // 30 minutes timeout (30 * 60 * 1000) / 30 seconds polling interval
          let newPackageStatusUrl = `https://deploy.mendix.com/api/1/apps/${encodeURIComponent(action.app_id)}/packages/${newPackageId}`;

          while (packageStatus !== "Succeeded" && packageBuildAttempts < maxPackageBuildAttempts) {
            packageBuildAttempts++;

            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: `Checking package status (attempt ${packageBuildAttempts}): ${packageStatus}`,
            });

            const packageStatusResp = await fetch(newPackageStatusUrl, {
              method: "GET",
              headers: {
                Accept: "application/json",
                "Mendix-Username": credential.username,
                "Mendix-ApiKey": credential.api_key || credential.pat || "",
              },
            });

            if (!packageStatusResp.ok) {
              const errorText = await packageStatusResp.text();
              throw new Error(`Failed to get package status: ${errorText}`);
            }

            const packageStatusData = await packageStatusResp.json();
            packageStatus = packageStatusData.Status;

            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: `Package status (attempt ${packageBuildAttempts}): ${packageStatus}`,
            });

            if (packageStatus === "Failed") {
              throw new Error(`Package build failed: ${packageStatusData.Error}`);
            }

            if (packageStatus !== "Succeeded") {
              // Wait 30 seconds before next poll
              await new Promise(resolve => setTimeout(resolve, 30000));
            }
          }

          if (packageStatus !== "Succeeded") {
            throw new Error(`Timeout waiting for package to build. Current status: ${packageStatus}`);
          }

          await supabase.from("cloud_action_logs").insert({
            user_id: user.id,
            action_id: action.id,
            level: "info",
            message: `Package built successfully, starting transport: ${newPackageId}`,
          });

          // Step 2: Transport the package to the target environment
          const transportUrl = `https://deploy.mendix.com/api/1/apps/${encodeURIComponent(action.app_id)}/environments/${encodeURIComponent(normalizedEnvironmentName)}/transport`;
          
          await supabase.from("cloud_action_logs").insert({
            user_id: user.id,
            action_id: action.id,
            level: "info",
            message: `Initiating transport to ${transportUrl} with PackageId: ${newPackageId}`,
          });

          const transportResp = await fetch(transportUrl, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Mendix-Username": credential.username,
              "Mendix-ApiKey": credential.api_key || credential.pat || "",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              PackageId: newPackageId,
            }),
          });

          await supabase.from("cloud_action_logs").insert({
            user_id: user.id,
            action_id: action.id,
            level: "info",
            message: `Transport response status: ${transportResp.status} ${transportResp.statusText}`,
          });

          if (!transportResp.ok) {
            let errorDetails = `HTTP ${transportResp.status}: ${transportResp.statusText}`;
            try {
              const errorText = await transportResp.text();
              if (errorText) {
                errorDetails += ` - ${errorText}`;
              }
            } catch (parseError) {
              errorDetails += ` - Unable to parse error response: ${parseError.message}`;
            }
            
            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "error",
              message: `Transport failed: ${errorDetails}`,
            });
            
            throw new Error(`Failed to transport package: ${errorDetails}`);
          }

          await supabase.from("cloud_action_logs").insert({
            user_id: user.id,
            action_id: action.id,
            level: "info",
            message: `Package transport started: ${newPackageId}`,
          });

          // Step 3: Stop the environment before backup
          await supabase.from("cloud_action_logs").insert({
            user_id: user.id,
            action_id: action.id,
            level: "info",
            message: `Stopping environment before backup`,
          });

          await callMendix("stop");

          await supabase.from("cloud_action_logs").insert({
            user_id: user.id,
            action_id: action.id,
            level: "info",
            message: `Stop command sent, polling for completion`,
          });

          // Poll until environment is stopped
          const deployStopSuccess = await pollEnvironmentStatus(
            action.credential_id,
            action.app_id,
            normalizedEnvironmentName,
            "stopped",
            deployRetryUntil,
            action.user_id
          );
          
          if (!deployStopSuccess) {
            throw new Error("Environment failed to stop within timeout period");
          }

          await supabase.from("cloud_action_logs").insert({
            user_id: user.id,
            action_id: action.id,
            level: "info",
            message: `Environment stopped successfully, transport completed for package: ${newPackageId}`,
          });

          // Step 4: Get environment ID and create a backup
          // First fetch the environment_id from our database
          const { data: environmentData, error: envError } = await supabase
            .from("mendix_environments")
            .select("environment_id")
            .eq("app_id", action.app_id)
            .eq("environment_name", normalizedEnvironmentName)
            .eq("user_id", user.id)
            .single();

          if (envError || !environmentData?.environment_id) {
            throw new Error(`Failed to find environment_id for app ${action.app_id}, environment ${normalizedEnvironmentName}`);
          }

          const environmentId = environmentData.environment_id;
          const backupUrl = `https://deploy.mendix.com/api/v2/apps/${encodeURIComponent(action.app_id)}/environments/${encodeURIComponent(environmentId)}/snapshots`;
          
          await supabase.from("cloud_action_logs").insert({
            user_id: user.id,
            action_id: action.id,
            level: "info",
            message: `Creating backup on environment: ${normalizedEnvironmentName} (ID: ${environmentId})`,
          });
          
          const backupResp = await fetch(backupUrl, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Mendix-Username": credential.username,
              "Mendix-ApiKey": credential.api_key || credential.pat || "",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              comment: `Backup created by PintosoftOps before deploy on ${new Date().toISOString()}`,
            }),
          });

          if (!backupResp.ok) {
            const errorText = await backupResp.text();
            throw new Error(`Failed to create backup: ${errorText}`);
          }

          const backupData = await backupResp.json();
          const backupId = backupData.snapshot_id;

          await supabase.from("cloud_action_logs").insert({
            user_id: user.id,
            action_id: action.id,
            level: "info",
            message: `Backup creation started: ${backupId}`,
          });

          // Step 5: Poll for backup completion
          let backupStatus = "queued";
          let backupAttempts = 0;
          const maxBackupAttempts = 60; // 30 minutes timeout
          let backupStatusUrl = `https://deploy.mendix.com/api/v2/apps/${encodeURIComponent(action.app_id)}/environments/${encodeURIComponent(environmentId)}/snapshots/${backupId}`;

          while (backupStatus !== "completed" && backupAttempts < maxBackupAttempts) {
            backupAttempts++;

            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: `Checking backup status (attempt ${backupAttempts}): ${backupStatus}`,
            });

            const backupStatusResp = await fetch(backupStatusUrl, {
              method: "GET",
              headers: {
                Accept: "application/json",
                "Mendix-Username": credential.username,
                "Mendix-ApiKey": credential.api_key || credential.pat || "",
              },
            });

            if (!backupStatusResp.ok) {
              const errorText = await backupStatusResp.text();
              throw new Error(`Failed to get backup status: ${errorText}`);
            }

            const backupStatusData = await backupStatusResp.json();
            backupStatus = backupStatusData.state;

            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: `Backup status (attempt ${backupAttempts}): ${backupStatus}`,
            });

            if (backupStatus === "failed") {
              throw new Error(`Backup failed: ${backupStatusData.status_message || "Unknown error"}`);
            }

            if (backupStatus !== "completed") {
              // Wait 30 seconds before next poll
              await new Promise(resolve => setTimeout(resolve, 30000));
            }
          }

          if (backupStatus !== "completed") {
            throw new Error(`Timeout waiting for backup to complete. Current status: ${backupStatus}`);
          }

          await supabase.from("cloud_action_logs").insert({
            user_id: user.id,
            action_id: action.id,
            level: "info",
            message: `Backup completed successfully: ${backupId}`,
          });

          // Step 6: Start the environment after backup
          await supabase.from("cloud_action_logs").insert({
            user_id: user.id,
            action_id: action.id,
            level: "info",
            message: `Starting environment after backup completion`,
          });

          await callMendix("start");

          await supabase.from("cloud_action_logs").insert({
            user_id: user.id,
            action_id: action.id,
            level: "info",
            message: `Start command sent, polling for completion`,
          });

          // Poll until environment is started
          const deployStartSuccess = await pollEnvironmentStatus(
            action.credential_id,
            action.app_id,
            normalizedEnvironmentName,
            "running",
            deployRetryUntil,
            action.user_id
          );
          
          if (!deployStartSuccess) {
            throw new Error("Environment failed to start within timeout period");
          }

          await supabase.from("cloud_action_logs").insert({
            user_id: user.id,
            action_id: action.id,
            level: "info",
            message: `Environment started successfully, deploy completed`,
          });
          break;

        case "transport":
          const transportActionPayload = action.payload as { packageId?: string; description?: string } || {};
          const { packageId, description: transportDescription } = transportActionPayload;

          if (!packageId) {
            throw new Error("Package ID is required for transport action");
          }

          await supabase.from("cloud_action_logs").insert({
            user_id: user.id,
            action_id: action.id,
            level: "info",
            message: `Starting transport of package ${packageId} to ${action.environment_name}`,
          });

          const transportActionUrl = `https://deploy.mendix.com/api/1/apps/${encodeURIComponent(action.app_id)}/environments/${encodeURIComponent(normalizedEnvironmentName)}/transport`;
          const transportActionResp = await fetch(transportActionUrl, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Mendix-Username": credential.username,
              "Mendix-ApiKey": credential.api_key || credential.pat || "",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              PackageId: packageId,
            }),
          });

          if (!transportActionResp.ok) {
            let errorDetails = `HTTP ${transportActionResp.status}: ${transportActionResp.statusText}`;
            try {
              const errorText = await transportActionResp.text();
              if (errorText) {
                errorDetails += ` - ${errorText}`;
              }
            } catch (parseError) {
              errorDetails += ` - Unable to parse error response: ${parseError.message}`;
            }
            
            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "error",
              message: `Transport failed: ${errorDetails}`,
            });
            
            throw new Error(`Failed to transport package: ${errorDetails}`);
          }

          await supabase.from("cloud_action_logs").insert({
            user_id: user.id,
            action_id: action.id,
            level: "info",
            message: `Package transport started: ${packageId}`,
          });

          // Poll for transport completion by checking environment status
          let transportActionAttempts = 0;
          const maxTransportActionAttempts = 60; // 30 minutes timeout
          let transportActionEnvironmentStatusUrl = `https://deploy.mendix.com/api/4/apps/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(normalizedEnvironmentName)}`;
          let isTransportActionComplete = false;

          await supabase.from("cloud_action_logs").insert({
            user_id: user.id,
            action_id: action.id,
            level: "info",
            message: `Starting transport completion check for PackageId: ${packageId}`,
          });

          while (!isTransportActionComplete && transportActionAttempts < maxTransportActionAttempts) {
            transportActionAttempts++;

            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: `Checking environment status for transport completion (attempt ${transportActionAttempts})`,
            });

            const transportActionEnvironmentStatusResp = await fetch(transportActionEnvironmentStatusUrl, {
              method: "GET",
              headers: {
                Accept: "application/json",
                "Mendix-Username": credential.username,
                "Mendix-ApiKey": credential.api_key || credential.pat || "",
              },
            });

            if (!transportActionEnvironmentStatusResp.ok) {
              let errorDetails = `HTTP ${transportActionEnvironmentStatusResp.status}: ${transportActionEnvironmentStatusResp.statusText}`;
              try {
                const errorText = await transportActionEnvironmentStatusResp.text();
                if (errorText) {
                  errorDetails += ` - ${errorText}`;
                }
              } catch (parseError) {
                errorDetails += ` - Unable to parse error response: ${parseError.message}`;
              }
              
              await supabase.from("cloud_action_logs").insert({
                user_id: user.id,
                action_id: action.id,
                level: "error",
                message: `Failed to get environment status: ${errorDetails}`,
              });
              
              throw new Error(`Failed to get environment status: ${errorDetails}`);
            }

            const transportActionEnvironmentData = await transportActionEnvironmentStatusResp.json();
            const currentTransportPackageId = transportActionEnvironmentData.PackageId;
            const transportActionEnvironmentStatus = transportActionEnvironmentData.Status;

            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: `Environment status: ${transportActionEnvironmentStatus}, Current PackageId: ${currentTransportPackageId}, Target PackageId: ${packageId}`,
            });

            // Check if the transport is complete by verifying the package ID
            if (currentTransportPackageId === packageId) {
              isTransportActionComplete = true;
              await supabase.from("cloud_action_logs").insert({
                user_id: user.id,
                action_id: action.id,
                level: "info",
                message: `Transport completed successfully - PackageId ${packageId} is now active on environment`,
              });
            } else {
              // Wait 30 seconds before next poll
              await new Promise(resolve => setTimeout(resolve, 30000));
            }
          }

          if (!isTransportActionComplete) {
            throw new Error(`Timeout waiting for transport to complete. PackageId ${packageId} was not found on the environment after ${transportActionAttempts} attempts.`);
          }

          await supabase.from("cloud_action_logs").insert({
            user_id: user.id,
            action_id: action.id,
            level: "info",
            message: `Package transport completed successfully: ${packageId}`,
          });
          break;

        default:
          throw new Error(`Unknown action type: ${action.action_type}`);
      }

      // Mark as succeeded
      await supabase
        .from("cloud_actions")
        .update({ status: "succeeded", completed_at: new Date().toISOString() })
        .eq("id", action.id)
        .eq("user_id", user.id);

      await supabase.from("cloud_action_logs").insert({
        user_id: user.id,
        action_id: action.id,
        level: "info",
        message: `Action completed successfully: ${action.action_type}`,
      });

      succeeded++;

    } catch (error) {
      console.error(`Error processing action ${action.id}:`, error);
      
      // Mark as failed
      await supabase
        .from("cloud_actions")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_message: error instanceof Error ? error.message : String(error),
        })
        .eq("id", action.id)
        .eq("user_id", user.id);

      await supabase.from("cloud_action_logs").insert({
        user_id: user.id,
        action_id: action.id,
        level: "error",
        message: `Action failed: ${error instanceof Error ? error.message : String(error)}`,
      });

      failed++;
    }
  }

  console.log(`Background processing completed: ${processed} processed, ${succeeded} succeeded, ${failed} failed`);
}