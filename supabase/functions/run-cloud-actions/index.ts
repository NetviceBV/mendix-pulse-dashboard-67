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
              action.environment_name,
              "running",
              startRetryUntil,
              jwt
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
            
            // Step 2: Poll until stopped (with timeout based on retry_until)
            const restartRetryUntil = action.retry_until ? new Date(action.retry_until) : new Date(Date.now() + 30 * 60 * 1000); // Default 30 minutes
            
            const restartStopSuccess = await pollEnvironmentStatus(
              action.credential_id,
              action.app_id,
              action.environment_name, // Using environment_name as environment_id
              "stopped",
              restartRetryUntil,
              jwt
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
              action.environment_name,
              "running",
              restartRetryUntil,
              jwt
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

            // Step 2: Poll for package creation completion
            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: "Waiting for package build to complete...",
            });

            let packageBuildComplete = false;
            let buildPollAttempts = 0;
            const maxBuildPollAttempts = 120; // 10 minutes with 5 second intervals

            while (!packageBuildComplete && buildPollAttempts < maxBuildPollAttempts && new Date() < deployRetryUntil) {
              buildPollAttempts++;
              await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

              try {
                const packageStatusResp = await fetch(`https://deploy.mendix.com/api/1/apps/${encodeURIComponent(action.app_id)}/packages/${encodeURIComponent(newPackageId)}`, {
                  headers: {
                    Accept: "application/json",
                    "Mendix-Username": credential.username,
                    "Mendix-ApiKey": credential.api_key || credential.pat || "",
                  },
                });

                if (!packageStatusResp.ok) {
                  throw new Error(`Failed to check package status: ${packageStatusResp.statusText}`);
                }

                const packageStatusData = await packageStatusResp.json();
                const buildStatus = packageStatusData.Status;

                await supabase.from("cloud_action_logs").insert({
                  user_id: user.id,
                  action_id: action.id,
                  level: "info",
                  message: `Package build status: ${buildStatus} (attempt ${buildPollAttempts})`,
                });

                if (buildStatus === "Succeeded") {
                  packageBuildComplete = true;
                  await supabase.from("cloud_action_logs").insert({
                    user_id: user.id,
                    action_id: action.id,
                    level: "info",
                    message: `Package build completed successfully: ${packageStatusData.Name}`,
                  });
                } else if (buildStatus === "Failed") {
                  throw new Error(`Package build failed`);
                }

              } catch (buildPollError) {
                await supabase.from("cloud_action_logs").insert({
                  user_id: user.id,
                  action_id: action.id,
                  level: "warning",
                  message: `Package build status check failed (attempt ${buildPollAttempts}): ${buildPollError instanceof Error ? buildPollError.message : String(buildPollError)}`,
                });
                // Continue polling unless we hit max attempts
              }
            }

            if (!packageBuildComplete) {
              throw new Error("Package build did not complete within timeout period");
            }

            // Now use the same transport logic as the transport action
            // Step 3: Transport package to target environment
            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: `Transporting package to target environment: ${action.environment_name}`,
            });

            const deployTransportUrl = `https://deploy.mendix.com/api/1/apps/${encodeURIComponent(action.app_id)}/environments/${encodeURIComponent(action.environment_name)}/transport`;
            const deployTransportResp = await fetch(deployTransportUrl, {
              method: "POST",
              headers: {
                Accept: "application/json",
                "Mendix-Username": credential.username,
                "Mendix-ApiKey": credential.api_key || credential.pat || "",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ PackageId: newPackageId }),
            });

            if (!deployTransportResp.ok) {
              const errorText = await deployTransportResp.text();
              throw new Error(`Failed to transport package: ${errorText}`);
            }

            // Step 4: Poll for transport completion
            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: "Waiting for package transport to complete...",
            });

            let deployTransportComplete = false;
            let deployPollAttempts = 0;
            const maxDeployPollAttempts = 60; // 5 minutes with 5 second intervals

            while (!deployTransportComplete && deployPollAttempts < maxDeployPollAttempts && new Date() < deployRetryUntil) {
              deployPollAttempts++;
              await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

              try {
                const targetPackageResp = await fetch(`https://deploy.mendix.com/api/1/apps/${encodeURIComponent(action.app_id)}/environments/${encodeURIComponent(action.environment_name)}/package`, {
                  headers: {
                    Accept: "application/json",
                    "Mendix-Username": credential.username,
                    "Mendix-ApiKey": credential.api_key || credential.pat || "",
                  },
                });

                if (!targetPackageResp.ok) {
                  throw new Error(`Failed to check target environment package: ${targetPackageResp.statusText}`);
                }

                const targetPackageData = await targetPackageResp.json();
                const currentPackageId = targetPackageData.PackageId;

                if (currentPackageId === newPackageId) {
                  deployTransportComplete = true;
                  await supabase.from("cloud_action_logs").insert({
                    user_id: user.id,
                    action_id: action.id,
                    level: "info",
                    message: `Package transport completed. Target environment now has package: ${targetPackageData.Name}`,
                  });
                }

              } catch (deployPollError) {
                await supabase.from("cloud_action_logs").insert({
                  user_id: user.id,
                  action_id: action.id,
                  level: "warning",
                  message: `Transport status check failed (attempt ${deployPollAttempts}): ${deployPollError instanceof Error ? deployPollError.message : String(deployPollError)}`,
                });
              }
            }

            if (!deployTransportComplete) {
              throw new Error("Package transport did not complete within timeout period");
            }

            // Step 5: Stop target environment
            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: `Stopping target environment: ${action.environment_name}`,
            });

            await callMendix("stop");

            // Step 6: Poll until stopped
            const deployStopSuccess = await pollEnvironmentStatus(
              action.credential_id,
              action.app_id,
              action.environment_name,
              "stopped",
              deployRetryUntil,
              jwt
            );

            if (!deployStopSuccess) {
              throw new Error("Environment failed to stop within timeout period");
            }

            // Step 7: Create backup
            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: "Creating backup of target environment",
            });

            const backupUrl = `https://deploy.mendix.com/api/1/apps/${encodeURIComponent(action.app_id)}/environments/${encodeURIComponent(action.environment_name)}/snapshots`;
            const backupResp = await fetch(backupUrl, {
              method: "POST",
              headers: {
                Accept: "application/json",
                "Mendix-Username": credential.username,
                "Mendix-ApiKey": credential.api_key || credential.pat || "",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                Comment: deployComment || "PintosoftOps Initiated Snapshot",
              }),
            });

            if (!backupResp.ok) {
              const errorText = await backupResp.text();
              throw new Error(`Failed to create backup: ${errorText}`);
            }

            const backupData = await backupResp.json();
            const deploySnapshotId = backupData.SnapshotId;

            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: `Backup created with ID: ${deploySnapshotId}`,
            });

            // Step 8: Start target environment
            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: `Starting target environment: ${action.environment_name}`,
            });

            await callMendix("start");

            // Poll to verify environment started
            const deployStartSuccess = await pollEnvironmentStatus(
              action.credential_id,
              action.app_id,
              action.environment_name,
              "running",
              deployRetryUntil,
              jwt
            );

            if (!deployStartSuccess) {
              throw new Error("Environment failed to start within timeout period");
            }

            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: "Deploy action completed successfully",
            });
            break;
          case "transport":
            // Extract source and target environments from payload
            const payload = action.payload as { sourceEnvironmentName?: string; comment?: string } || {};
            const sourceEnvironment = payload.sourceEnvironmentName;
            const transportComment = payload.comment || "PintosoftOps Initiated Snapshot";
            
            if (!sourceEnvironment) {
              throw new Error("Source environment is required for transport action");
            }

            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: `Starting transport from ${sourceEnvironment} to ${action.environment_name}`,
            });

            const transportRetryUntil = action.retry_until ? new Date(action.retry_until) : new Date(Date.now() + 60 * 60 * 1000); // Default 60 minutes

            // Step 1: Get package from source environment
            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: `Getting package from source environment: ${sourceEnvironment}`,
            });

            const packageUrl = `https://deploy.mendix.com/api/1/apps/${encodeURIComponent(action.app_id)}/environments/${encodeURIComponent(sourceEnvironment)}/package`;
            const packageResp = await fetch(packageUrl, {
              headers: {
                Accept: "application/json",
                "Mendix-Username": credential.username,
                "Mendix-ApiKey": credential.api_key || credential.pat || "",
              },
            });

            if (!packageResp.ok) {
              const errorText = await packageResp.text();
              throw new Error(`Failed to get package from source environment: ${errorText}`);
            }

            const packageData = await packageResp.json();
            const packageId = packageData.PackageId;

            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: `Retrieved package: ${packageData.Name} (${packageId})`,
            });

            // Step 2: Transport package to target environment
            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: `Transporting package to target environment: ${action.environment_name}`,
            });

            const transportUrl = `https://deploy.mendix.com/api/1/apps/${encodeURIComponent(action.app_id)}/environments/${encodeURIComponent(action.environment_name)}/transport`;
            const transportResp = await fetch(transportUrl, {
              method: "POST",
              headers: {
                Accept: "application/json",
                "Mendix-Username": credential.username,
                "Mendix-ApiKey": credential.api_key || credential.pat || "",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ PackageId: packageId }),
            });

            if (!transportResp.ok) {
              const errorText = await transportResp.text();
              throw new Error(`Failed to transport package: ${errorText}`);
            }

            // Step 3: Poll for transport completion by checking package ID
            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: "Waiting for package transport to complete...",
            });

            // Poll until the target environment has the transported package
            let transportComplete = false;
            let pollAttempts = 0;
            const maxPollAttempts = 60; // 5 minutes with 5 second intervals

            while (!transportComplete && pollAttempts < maxPollAttempts && new Date() < transportRetryUntil) {
              pollAttempts++;
              await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

              try {
                const targetPackageResp = await fetch(`https://deploy.mendix.com/api/1/apps/${encodeURIComponent(action.app_id)}/environments/${encodeURIComponent(action.environment_name)}/package`, {
                  headers: {
                    Accept: "application/json",
                    "Mendix-Username": credential.username,
                    "Mendix-ApiKey": credential.api_key || credential.pat || "",
                  },
                });

                if (targetPackageResp.ok) {
                  const targetPackageData = await targetPackageResp.json();
                  if (targetPackageData.PackageId === packageId) {
                    transportComplete = true;
                    await supabase.from("cloud_action_logs").insert({
                      user_id: user.id,
                      action_id: action.id,
                      level: "info",
                      message: `Package transport completed successfully (attempt ${pollAttempts})`,
                    });
                  }
                }
              } catch (pollError) {
                await supabase.from("cloud_action_logs").insert({
                  user_id: user.id,
                  action_id: action.id,
                  level: "warning",
                  message: `Transport polling attempt ${pollAttempts} failed: ${pollError instanceof Error ? pollError.message : String(pollError)}`,
                });
              }
            }

            if (!transportComplete) {
              throw new Error("Transport did not complete within timeout period");
            }

            // Step 4: Stop target environment
            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: "Stopping target environment for backup...",
            });

            await callMendix("stop");

            const targetStopSuccess = await pollEnvironmentStatus(
              action.credential_id,
              action.app_id,
              action.environment_name,
              "stopped",
              transportRetryUntil,
              jwt
            );

            if (!targetStopSuccess) {
              throw new Error("Target environment failed to stop within timeout period");
            }

            // Step 5: Create backup of target environment
            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: "Creating backup of target environment...",
            });

            // Get project_id and environment_id for backup API
            const { data: envData, error: envError } = await supabase
              .from("mendix_environments")
              .select("environment_id")
              .eq("app_id", action.app_id)
              .ilike("environment_name", action.environment_name)
              .eq("user_id", user.id)
              .maybeSingle();

            if (envError || !envData?.environment_id) {
              throw new Error("Could not find environment ID for backup creation");
            }

            const { data: appData, error: appError } = await supabase
              .from("mendix_apps")
              .select("project_id")
              .eq("app_id", action.app_id)
              .eq("user_id", user.id)
              .maybeSingle();

            if (appError || !appData?.project_id) {
              throw new Error("Could not find project ID for backup creation");
            }

            const snapshotUrl = `https://deploy.mendix.com/api/v2/apps/${appData.project_id}/environments/${envData.environment_id}/snapshots`;
            const snapshotResp = await fetch(snapshotUrl, {
              method: "POST",
              headers: {
                Accept: "application/json",
                "Mendix-Username": credential.username,
                "Mendix-ApiKey": credential.api_key || credential.pat || "",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ comment: transportComment }),
            });

            if (!snapshotResp.ok) {
              const errorText = await snapshotResp.text();
              throw new Error(`Failed to create backup: ${errorText}`);
            }

            const snapshotData = await snapshotResp.json();
            const transportSnapshotId = snapshotData.snapshot_id;

            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: `Backup creation started: ${transportSnapshotId}`,
            });

            // Step 6: Poll backup completion
            let backupComplete = false;
            let backupAttempts = 0;
            const maxBackupAttempts = 120; // 10 minutes with 5 second intervals

            while (!backupComplete && backupAttempts < maxBackupAttempts && new Date() < transportRetryUntil) {
              backupAttempts++;
              await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

              try {
                const statusUrl = `https://deploy.mendix.com/api/v2/apps/${appData.project_id}/environments/${envData.environment_id}/snapshots/${transportSnapshotId}`;
                const statusResp = await fetch(statusUrl, {
                  headers: {
                    Accept: "application/json",
                    "Mendix-Username": credential.username,
                    "Mendix-ApiKey": credential.api_key || credential.pat || "",
                  },
                });

                if (statusResp.ok) {
                  const statusData = await statusResp.json();
                  if (statusData.state === "completed") {
                    backupComplete = true;
                    await supabase.from("cloud_action_logs").insert({
                      user_id: user.id,
                      action_id: action.id,
                      level: "info",
                      message: `Backup completed successfully (attempt ${backupAttempts})`,
                    });
                  } else if (statusData.state === "failed") {
                    throw new Error(`Backup failed: ${statusData.status_message || 'Unknown error'}`);
                  }
                }
              } catch (backupPollError) {
                await supabase.from("cloud_action_logs").insert({
                  user_id: user.id,
                  action_id: action.id,
                  level: "warning",
                  message: `Backup polling attempt ${backupAttempts} failed: ${backupPollError instanceof Error ? backupPollError.message : String(backupPollError)}`,
                });
              }
            }

            if (!backupComplete) {
              throw new Error("Backup did not complete within timeout period");
            }

            // Step 7: Start target environment
            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: "Starting target environment with transported package...",
            });

            await callMendix("start");

            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: "Start command sent, waiting for environment to start...",
            });
            
            // Poll to verify environment started
            const transportStartRetryUntil = action.retry_until ? new Date(action.retry_until) : new Date(Date.now() + 30 * 60 * 1000);
            const transportActionSuccess = await pollEnvironmentStatus(
              action.credential_id,
              action.app_id,
              action.environment_name,
              "running",
              transportStartRetryUntil,
              jwt
            );
            
            if (!transportActionSuccess) {
              throw new Error("Target environment failed to start within timeout period");
            }

            await supabase.from("cloud_action_logs").insert({
              user_id: user.id,
              action_id: action.id,
              level: "info",
              message: "Transport workflow completed successfully",
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
