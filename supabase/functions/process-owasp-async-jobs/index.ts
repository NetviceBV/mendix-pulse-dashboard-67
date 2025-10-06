import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { getErrorMessage } from '../_shared/error-utils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[OWASP Async Worker] Starting job processing...');

    // Get ONE queued job (process one at a time to avoid CPU timeout)
    const { data: jobs, error: jobsError } = await supabase
      .from('owasp_async_jobs')
      .select('*')
      .eq('status', 'queued')
      .lt('attempts', 3) // Only process jobs that haven't exceeded max attempts
      .order('created_at', { ascending: true })
      .limit(1); // Process ONE job per invocation to stay within CPU limits

    if (jobsError) {
      console.error('[OWASP Async Worker] Error fetching jobs:', jobsError);
      throw jobsError;
    }

    if (!jobs || jobs.length === 0) {
      console.log('[OWASP Async Worker] No queued jobs found');
      return new Response(
        JSON.stringify({ message: 'No jobs to process', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[OWASP Async Worker] Found ${jobs.length} jobs to process`);
    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;

    // Process each job
    for (const job of jobs) {
      try {
        console.log(`[OWASP Async Worker] Processing job ${job.id} type: ${job.job_type} (attempt ${job.attempts + 1}/${job.max_attempts})`);

        // Mark job as processing
        await supabase
          .from('owasp_async_jobs')
          .update({
            status: 'processing',
            started_at: new Date().toISOString(),
            attempts: job.attempts + 1,
          })
          .eq('id', job.id);

        // Execute the job based on job_type
        let result: any;
        let error_message: string | null = null;

        if (job.job_type === 'discovery') {
          // Discovery job: count domain models and queue multi-check batch jobs
          result = await discoverAndQueueBatches(job, supabase);
        } else if (job.job_type === 'multi-check-batch') {
          // Multi-check batch job: run all checks on assigned domain models
          result = await executeMultiCheckBatch(job, supabase);
        } else {
          error_message = `Unknown job type: ${job.job_type}`;
          result = { status: 'error', details: error_message };
        }

        if (result.status === 'error') {
          error_message = result.details;
        }

        // Update job with result
        const updateData: any = {
          status: result.status === 'error' ? 'failed' : 'completed',
          result: result,
          completed_at: new Date().toISOString(),
        };

        if (error_message) {
          updateData.error_message = error_message;
        }

        await supabase
          .from('owasp_async_jobs')
          .update(updateData)
          .eq('id', job.id);

        // Update the run's overall status if all jobs are complete
        if (job.run_id) {
          await updateRunStatus(supabase, job.run_id);
        }

        processedCount++;
        if (result.status !== 'error') {
          successCount++;
        } else {
          failedCount++;
        }

        console.log(`[OWASP Async Worker] Job ${job.id} completed with status: ${result.status}`);
      } catch (error) {
        console.error(`[OWASP Async Worker] Error processing job ${job.id}:`, error);
        
        // Mark job as failed if max attempts reached
        const shouldFail = job.attempts + 1 >= job.max_attempts;
        
        await supabase
          .from('owasp_async_jobs')
          .update({
            status: shouldFail ? 'failed' : 'queued', // Re-queue if not max attempts
            error_message: getErrorMessage(error),
            attempts: job.attempts + 1,
          })
          .eq('id', job.id);

        failedCount++;
        processedCount++;
      }
    }

    console.log(`[OWASP Async Worker] Completed. Processed: ${processedCount}, Success: ${successCount}, Failed: ${failedCount}`);

    return new Response(
      JSON.stringify({
        message: 'Job processing complete',
        processed: processedCount,
        success: successCount,
        failed: failedCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[OWASP Async Worker] Fatal error:', error);
    return new Response(
      JSON.stringify({ error: getErrorMessage(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Discovery job: count domain models and queue multi-check batch jobs
async function discoverAndQueueBatches(job: any, supabase: any): Promise<{ status: string; details: string }> {
  try {
    const { credential_id, project_id, environment_name, user_id, checks_to_run } = job.payload;
    const { run_id } = job;

    console.log(`[Discovery] Starting discovery for project: ${project_id}`);
    console.log(`[Discovery] Will queue batches for ${checks_to_run.length} checks`);

    // Fetch Mendix credentials
    const { data: credentials, error: credError } = await supabase
      .from('mendix_credentials')
      .select('*')
      .eq('id', credential_id)
      .eq('user_id', user_id)
      .single();

    if (credError || !credentials || !credentials.pat) {
      return {
        status: 'error',
        details: 'Failed to fetch credentials or PAT not available',
      };
    }

    // Fetch app details
    const { data: app, error: appError } = await supabase
      .from('mendix_apps')
      .select('project_id, version')
      .eq('project_id', project_id)
      .eq('user_id', user_id)
      .single();

    if (appError || !app || !app.project_id) {
      return {
        status: 'error',
        details: 'Failed to fetch application details',
      };
    }

    // Import Mendix SDK
    const { MendixPlatformClient, setPlatformConfig } = await import("npm:mendixplatformsdk@5.2.0");

    // Configure SDK
    setPlatformConfig({ mendixToken: credentials.pat });
    const client = new MendixPlatformClient();

    console.log(`[Discovery] Getting app and repository info`);
    const mendixApp = client.getApp(app.project_id);
    
    const repository = mendixApp.getRepository();
    const repositoryInfo = await repository.getInfo();
    const repoType = repositoryInfo?.type;
    
    const primaryBranch = repoType === 'svn' ? 'trunk' : 'main';
    const fallbackBranches = repoType === 'svn' ? ['trunk'] : ['main', 'master'];
    
    let workingCopy: any;
    let lastErr: any;
    
    for (const candidate of [primaryBranch, ...fallbackBranches.filter(b => b !== primaryBranch)]) {
      try {
        console.log(`[Discovery] Attempting working copy on branch: ${candidate}`);
        workingCopy = await mendixApp.createTemporaryWorkingCopy(candidate);
        console.log(`[Discovery] Working copy created on branch: ${candidate}`);
        break;
      } catch (e: any) {
        lastErr = e;
        console.warn(`[Discovery] Failed on ${candidate}:`, e?.errorMessage || e?.message);
      }
    }
    
    if (!workingCopy) {
      return {
        status: 'error',
        details: `Could not create working copy. Last error: ${lastErr?.errorMessage || lastErr?.message || String(lastErr)}`,
      };
    }

    const model = await workingCopy.openModel();
    console.log('[Discovery] Model opened successfully');

    // Count domain models
    const domainModels = model.allDomainModels();
    const totalDomainModels = domainModels.length;
    console.log(`[Discovery] Found ${totalDomainModels} domain models`);
    console.log('[Discovery] Working copy will be automatically cleaned up by Mendix Platform');

    // Create SINGLE job covering ALL domain models (no batching)
    console.log(`[Discovery] Creating single processing job for all ${totalDomainModels} models`);
    console.log(`[Discovery] This will open the model ONCE and process all entities in a single job`);

    // Create ONE job that covers ALL models
    const singleJob = {
      user_id,
      run_id,
      step_id: null, // No single step, this is multi-check
      job_type: 'multi-check-batch',
      payload: {
        credential_id,
        project_id,
        environment_name,
        user_id,
        batch_number: 0,
        total_batches: 1,
        domain_model_start: 0,
        domain_model_end: totalDomainModels,
        checks_to_run, // Pass all checks to the job
      },
      status: 'queued',
    };

    // Insert the single job
    const { error: jobError } = await supabase
      .from('owasp_async_jobs')
      .insert([singleJob]);

    if (jobError) {
      console.error('[Discovery] Failed to create processing job:', jobError);
      return {
        status: 'error',
        details: `Failed to create processing job: ${jobError.message}`,
      };
    }

    console.log(`[Discovery] Successfully queued single processing job for ${totalDomainModels} models with ${checks_to_run.length} checks`);

    return {
      status: 'completed',
      details: `Discovery complete: ${totalDomainModels} domain models found, 1 processing job created for ${checks_to_run.length} checks`,
    };

  } catch (error) {
    console.error('[Discovery] Error during discovery:', error);
    
    // Mark the run as failed when discovery fails
    if (job.run_id) {
      try {
        await supabase
          .from('owasp_check_runs')
          .update({
            run_completed_at: new Date().toISOString(),
            overall_status: 'fail',
          })
          .eq('id', job.run_id);
        console.log(`[Discovery] Marked run ${job.run_id} as failed due to discovery error`);
      } catch (updateError) {
        console.error('[Discovery] Failed to update run status:', updateError);
      }
    }
    
    return {
      status: 'error',
      details: `Failed to discover domain models: ${getErrorMessage(error)}`,
    };
  }
}

// Execute multiple checks on a batch of domain models
async function executeMultiCheckBatch(job: any, supabase: any): Promise<{ status: string; details: string; check_results?: any }> {
  const BATCH_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
  const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 seconds
  
  const startTime = Date.now();
  let heartbeatInterval: number | null = null;
  let processedEntities = 0;
  let totalEntities = 0;
  let currentJobId = job.id;
  let shutdownHandled = false;
  
  try {
    const { credential_id, project_id, environment_name, user_id, batch_number, total_batches, domain_model_start, domain_model_end, checks_to_run } = job.payload;

    // Add CPU timeout handler FIRST
    addEventListener('beforeunload', async (ev) => {
      if (shutdownHandled) return;
      shutdownHandled = true;
      
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      console.log(`[Batch ${batch_number + 1}/${total_batches}] ⚠️ CPU TIMEOUT DETECTED: ${ev.detail?.reason}`);
      console.log(`[Batch ${batch_number + 1}/${total_batches}] Saving progress: ${processedEntities}/${totalEntities} entities processed in ${elapsed}s`);
      
      try {
        await supabase
          .from('owasp_async_jobs')
          .update({ 
            status: 'failed',
            error_message: `CPU timeout after ${elapsed}s - processed ${processedEntities}/${totalEntities} entities`,
            result: {
              checkpoint: {
                processedEntities,
                totalEntities,
                timeElapsed: elapsed
              },
              reason: 'cpu_timeout'
            },
            completed_at: new Date().toISOString()
          })
          .eq('id', currentJobId);
        console.log(`[Batch ${batch_number + 1}/${total_batches}] Progress saved successfully before timeout`);
      } catch (err) {
        console.error(`[Batch ${batch_number + 1}/${total_batches}] Failed to save progress on timeout:`, err);
      }
    });

    console.log(`[Batch ${batch_number + 1}/${total_batches}] Starting for project: ${project_id}, models ${domain_model_start}-${domain_model_end - 1}`);
    console.log(`[Batch ${batch_number + 1}/${total_batches}] Running ${checks_to_run.length} checks`);
    console.log(`[Batch ${batch_number + 1}/${total_batches}] Timeout set to ${BATCH_TIMEOUT_MS / 1000 / 60} minutes`);
    
    // Start heartbeat mechanism to update job timestamp
    heartbeatInterval = setInterval(async () => {
      try {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const progress = totalEntities > 0 ? ((processedEntities / totalEntities) * 100).toFixed(1) : '0.0';
        
        await supabase
          .from('owasp_async_jobs')
          .update({ 
            updated_at: new Date().toISOString(),
            progress: `Processing: ${processedEntities}/${totalEntities} entities (${progress}%, ${elapsed}s elapsed)`
          })
          .eq('id', job.id);
        
        console.log(`[Batch ${batch_number + 1}/${total_batches}] ❤️ Heartbeat: ${processedEntities}/${totalEntities} entities (${progress}%), ${elapsed}s elapsed`);
        
        // Warning if approaching timeout (8 minutes = 480s)
        if (elapsed > 480) {
          console.warn(`[Batch ${batch_number + 1}/${total_batches}] ⚠️ WARNING: Approaching 10-minute timeout limit (${elapsed}s elapsed)`);
        }
      } catch (error) {
        console.error(`[Batch ${batch_number + 1}/${total_batches}] Heartbeat error:`, error);
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Fetch Mendix credentials
    const { data: credentials, error: credError } = await supabase
      .from('mendix_credentials')
      .select('*')
      .eq('id', credential_id)
      .eq('user_id', user_id)
      .single();

    if (credError || !credentials || !credentials.pat) {
      return {
        status: 'error',
        details: 'Failed to fetch credentials or PAT not available',
      };
    }

    // Fetch app details
    const { data: app, error: appError } = await supabase
      .from('mendix_apps')
      .select('project_id, version')
      .eq('project_id', project_id)
      .eq('user_id', user_id)
      .single();

    if (appError || !app || !app.project_id) {
      return {
        status: 'error',
        details: 'Failed to fetch application details',
      };
    }

    // Import Mendix SDK
    const { MendixPlatformClient, setPlatformConfig } = await import("npm:mendixplatformsdk@5.2.0");
    const { domainmodels } = await import("npm:mendixmodelsdk@4.102.0");

    // Configure SDK
    setPlatformConfig({ mendixToken: credentials.pat });
    const client = new MendixPlatformClient();

    console.log(`[Batch ${batch_number + 1}/${total_batches}] Getting app and repository info`);
    const mendixApp = client.getApp(app.project_id);
    
    const repository = mendixApp.getRepository();
    const repositoryInfo = await repository.getInfo();
    const repoType = repositoryInfo?.type;
    
    const primaryBranch = repoType === 'svn' ? 'trunk' : 'main';
    const fallbackBranches = repoType === 'svn' ? ['trunk'] : ['main', 'master'];
    
    let workingCopy: any;
    let lastErr: any;
    
    for (const candidate of [primaryBranch, ...fallbackBranches.filter(b => b !== primaryBranch)]) {
      try {
        console.log(`[Batch ${batch_number + 1}/${total_batches}] Attempting working copy on branch: ${candidate}`);
        workingCopy = await mendixApp.createTemporaryWorkingCopy(candidate);
        console.log(`[Batch ${batch_number + 1}/${total_batches}] Working copy created on branch: ${candidate}`);
        break;
      } catch (e: any) {
        lastErr = e;
        console.warn(`[Batch ${batch_number + 1}/${total_batches}] Failed on ${candidate}:`, e?.errorMessage || e?.message);
      }
    }
    
    if (!workingCopy) {
      return {
        status: 'error',
        details: `Could not create working copy. Last error: ${lastErr?.errorMessage || lastErr?.message || String(lastErr)}`,
      };
    }

    console.log(`[Batch ${batch_number + 1}/${total_batches}] Opening Mendix model for project ${project_id}...`);
    const modelOpenStart = Date.now();
    
    const model = await workingCopy.openModel();
    
    const modelOpenTime = Date.now() - modelOpenStart;
    console.log(`[Batch ${batch_number + 1}/${total_batches}] ✓ Model opened successfully in ${modelOpenTime}ms (${(modelOpenTime / 1000).toFixed(1)}s)`);
    if (modelOpenTime > 30000) {
      console.warn(`[Batch ${batch_number + 1}/${total_batches}] ⚠️ Model opening took ${(modelOpenTime / 1000).toFixed(1)}s - this is the most CPU-intensive operation`);
    }

    // Initialize results storage for each check
    const checkResults: any = {};
    checks_to_run.forEach((check: any) => {
      checkResults[check.check_type] = {
        step_id: check.step_id,
        owasp_id: check.owasp_id,
        step_name: check.step_name,
        vulnerable_entities: []
      };
    });

    // Get project security (needed for all checks)
    const allSecurityUnits = model.allProjectSecurities();
    console.log(`[Batch ${batch_number + 1}/${total_batches}] Found ${allSecurityUnits.length} project security units`);
    
    let guestContext: any = null;
    
    if (allSecurityUnits.length > 0) {
      const projectSecurity = allSecurityUnits[0];
      await projectSecurity.load();
      
      if (projectSecurity.enableGuestAccess && projectSecurity.guestUserRoleName) {
        const guestUserRoleName = projectSecurity.guestUserRoleName;
        console.log(`[Batch ${batch_number + 1}/${total_batches}] Guest/Anonymous role: ${guestUserRoleName}`);
        
        // Find guest module roles
        const guestModuleRoles: Array<{ name: string; qualifiedName: string }> = [];
        const userRoles = projectSecurity.userRoles;
        
        let guestUserRole = null;
        for (const userRole of userRoles) {
          if (userRole && userRole.name === guestUserRoleName) {
            guestUserRole = userRole;
            break;
          }
        }
        
        if (guestUserRole) {
          for (const moduleRole of guestUserRole.moduleRoles) {
            if (moduleRole && moduleRole.name && moduleRole.qualifiedName) {
              guestModuleRoles.push({
                name: moduleRole.name,
                qualifiedName: moduleRole.qualifiedName
              });
            }
          }
        }
        
        guestContext = { guestModuleRoles };
      }
    }

    // Get all domain models and slice to the batch range
    const allDomainModels = model.allDomainModels();
    const domainModels = allDomainModels.slice(domain_model_start, domain_model_end);
    console.log(`[Batch ${batch_number + 1}/${total_batches}] Processing ${domainModels.length} domain models (${domain_model_start}-${domain_model_end - 1} of ${allDomainModels.length} total)`);

    // Helper function to check if an entity is persistable
    async function isPersistable(entity: any): Promise<boolean> {
      try {
        const generalization = entity.generalization;
        
        if (!generalization) return false;
        
        if (generalization instanceof domainmodels.NoGeneralization) {
          return generalization.persistable;
        }
        
        if (generalization instanceof domainmodels.Generalization) {
          const parentEntity = generalization.generalization;
          if (!parentEntity) return true;
          
          await parentEntity.load();
          return await isPersistable(parentEntity);
        }
        
        return false;
      } catch (error) {
        console.error(`Error checking persistability:`, error);
        return false;
      }
    }

    // Count total entities for progress tracking
    for (const domainModel of domainModels) {
      await domainModel.load();
      totalEntities += domainModel.entities.filter((e: any) => e instanceof domainmodels.Entity).length;
    }
    console.log(`[Batch ${batch_number + 1}/${total_batches}] Total entities to process: ${totalEntities}`);

    // Process each domain model
    for (const domainModel of domainModels) {
      await domainModel.load();
      const moduleName = domainModel.containerAsModule ? domainModel.containerAsModule.name : 'Unknown';
      const moduleIndex = domainModels.indexOf(domainModel);
      console.log(`[Batch ${batch_number + 1}/${total_batches}] Processing module ${moduleIndex + 1}/${domainModels.length}: ${moduleName}`);

      for (const entity of domainModel.entities) {
        // Check timeout
        if (Date.now() - startTime > BATCH_TIMEOUT_MS) {
          if (heartbeatInterval) clearInterval(heartbeatInterval);
          console.error(`[Batch ${batch_number + 1}/${total_batches}] TIMEOUT after ${BATCH_TIMEOUT_MS / 1000}s`);
          return {
            status: 'error',
            details: `Batch ${batch_number + 1}/${total_batches} timed out after ${BATCH_TIMEOUT_MS / 1000 / 60} minutes. Processed ${processedEntities}/${totalEntities} entities.`,
          };
        }
        
        if (!(entity instanceof domainmodels.Entity)) continue;
        if (!entity) continue;

        try {
          await entity.load();
          
          const entityName = entity.name || 'UnknownEntity';
          const entityQualifiedName = entity.qualifiedName || 'Unknown';

          const persistable = await isPersistable(entity);
          if (!persistable) {
            processedEntities++;
            continue;
          }

          // Run all checks on this entity
          for (const check of checks_to_run) {
            const vulnerabilityFound = await runCheckOnEntity(
              check.check_type,
              entity,
              {
                guestContext,
                moduleName,
                entityName,
                entityQualifiedName
              }
            );
            
            if (vulnerabilityFound) {
              checkResults[check.check_type].vulnerable_entities.push(vulnerabilityFound);
            }
          }
          
          processedEntities++;
          
          // Log progress every 5 entities for more granular tracking
          if (processedEntities % 5 === 0) {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const rate = processedEntities / elapsed;
            const remaining = (totalEntities - processedEntities) / rate;
            console.log(`[Batch ${batch_number + 1}/${total_batches}] Progress: ${processedEntities}/${totalEntities} entities (${elapsed}s elapsed, ~${Math.ceil(remaining)}s remaining, ${rate.toFixed(1)} entities/s)`);
          }
        } catch (entityError) {
          console.error(`[Batch ${batch_number + 1}/${total_batches}] Error processing entity in ${moduleName}:`, getErrorMessage(entityError));
          processedEntities++;
          // Continue with next entity instead of failing entire batch
        }
      }
    }
    
    // Clear heartbeat
    if (heartbeatInterval) clearInterval(heartbeatInterval);

    console.log(`[Batch ${batch_number + 1}/${total_batches}] Working copy will be automatically cleaned up by Mendix Platform`);

    // Enhanced final summary
    const totalTime = Math.floor((Date.now() - startTime) / 1000);
    const avgTimePerEntity = totalEntities > 0 ? (totalTime / totalEntities).toFixed(2) : 'N/A';
    
    console.log(`[Batch ${batch_number + 1}/${total_batches}] ====== BATCH COMPLETED ======`);
    console.log(`[Batch ${batch_number + 1}/${total_batches}] Total time: ${totalTime}s (${(totalTime / 60).toFixed(1)} minutes)`);
    console.log(`[Batch ${batch_number + 1}/${total_batches}] Entities processed: ${processedEntities}/${totalEntities}`);
    console.log(`[Batch ${batch_number + 1}/${total_batches}] Average time per entity: ${avgTimePerEntity}s`);
    console.log(`[Batch ${batch_number + 1}/${total_batches}] Checks run: ${checks_to_run.length}`);

    // Log results summary
    for (const [checkType, result] of Object.entries(checkResults)) {
      const vulnCount = (result as any).vulnerable_entities.length;
      console.log(`[Batch ${batch_number + 1}/${total_batches}] ${checkType}: ${vulnCount} vulnerabilities found`);
    }

    return {
      status: 'completed',
      details: `Batch ${batch_number + 1}/${total_batches} completed in ${totalTime}s - ${processedEntities}/${totalEntities} entities processed`,
      check_results: checkResults
    };

  } catch (error) {
    // Clear heartbeat on error
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    
    console.error(`[Batch ${job.payload.batch_number + 1}/${job.payload.total_batches}] Error during analysis:`, error);
    return {
      status: 'error',
      details: `Batch ${job.payload.batch_number + 1}/${job.payload.total_batches} failed: ${getErrorMessage(error)}`,
    };
  }
}

// Check function registry - add new checks here
async function runCheckOnEntity(
  checkType: string, 
  entity: any, 
  context: any
): Promise<any> {
  switch (checkType) {
    case 'A01-anonymous-entity':
      return checkAnonymousEntityAccess(entity, context);
    
    // Future checks can be added here:
    // case 'A03-sql-injection':
    //   return checkSQLInjectionRisk(entity, context);
    // case 'A04-complex-access-rules':
    //   return checkAccessRuleComplexity(entity, context);
    
    default:
      console.warn(`Unknown check type: ${checkType}`);
      return null;
  }
}

// Check implementation: Anonymous entity access without XPath
function checkAnonymousEntityAccess(entity: any, context: any): any {
  const { guestContext, moduleName, entityName, entityQualifiedName } = context;
  
  if (!guestContext || !guestContext.guestModuleRoles || guestContext.guestModuleRoles.length === 0) {
    return null; // No guest access configured
  }
  
  const accessRules = entity.accessRules || [];
  
  const anonymousAccessRules = accessRules.filter((rule: any) => {
    if (!rule || !rule.moduleRoles) return false;
    return rule.moduleRoles.some((moduleRole: any) => {
      if (!moduleRole) return false;
      return guestContext.guestModuleRoles.some((guestModuleRole: any) => 
        moduleRole.qualifiedName === guestModuleRole.qualifiedName
      );
    });
  });

  if (anonymousAccessRules.length > 0) {
    const hasRuleWithoutXPath = anonymousAccessRules.some((rule: any) => 
      !rule.xPathConstraint || rule.xPathConstraint.trim() === ''
    );
    
    if (hasRuleWithoutXPath) {
      return {
        module: moduleName,
        name: entityName,
        qualifiedName: entityQualifiedName
      };
    }
  }
  
  return null;
}

// Update the run's overall status based on all check results
async function updateRunStatus(supabase: any, runId: string): Promise<void> {
  try {
    // Check if there are any pending jobs for this run
    const { data: pendingJobs } = await supabase
      .from('owasp_async_jobs')
      .select('id')
      .eq('run_id', runId)
      .in('status', ['queued', 'processing'])
      .limit(1);

    // If there are still pending jobs, don't update the run status yet
    if (pendingJobs && pendingJobs.length > 0) {
      console.log(`[OWASP Async Worker] Run ${runId} still has pending jobs, skipping status update`);
      return;
    }

    console.log(`[OWASP Async Worker] All jobs complete for run ${runId}, aggregating results...`);

    // Get all completed batch jobs for this run
    const { data: completedJobs, error: jobsError } = await supabase
      .from('owasp_async_jobs')
      .select('result, payload')
      .eq('run_id', runId)
      .eq('job_type', 'multi-check-batch')
      .eq('status', 'completed');

    if (jobsError || !completedJobs) {
      console.error('[OWASP Async Worker] Error fetching completed jobs:', jobsError);
      return;
    }

    console.log(`[OWASP Async Worker] Aggregating ${completedJobs.length} batch jobs`);

    // Aggregate results by check_type
    const aggregatedResults: any = {};
    
    for (const job of completedJobs) {
      const checkResults = job.result?.check_results || {};
      
      for (const [checkType, result] of Object.entries(checkResults)) {
        const typedResult = result as any;
        
        if (!aggregatedResults[checkType]) {
          aggregatedResults[checkType] = {
            step_id: typedResult.step_id,
            owasp_id: typedResult.owasp_id,
            step_name: typedResult.step_name,
            vulnerable_entities: []
          };
        }
        
        // Merge vulnerable entities
        aggregatedResults[checkType].vulnerable_entities.push(
          ...typedResult.vulnerable_entities
        );
      }
    }

    // Create/update owasp_check_results for each check type
    let passCount = 0;
    let failCount = 0;
    
    for (const [checkType, result] of Object.entries(aggregatedResults)) {
      const typedResult = result as any;
      const hasVulnerabilities = typedResult.vulnerable_entities.length > 0;
      
      const status = hasVulnerabilities ? 'fail' : 'pass';
      const totalVulnerable = typedResult.vulnerable_entities.length;
      const entityList = typedResult.vulnerable_entities
        .slice(0, 10)
        .map((v: any) => `${v.module}.${v.name}`)
        .join(', ');
      
      const details = hasVulnerabilities
        ? `✗ SECURITY ISSUE: Found ${totalVulnerable} persistable entit${totalVulnerable === 1 ? 'y' : 'ies'} with anonymous access and no XPath constraints. Entities: ${entityList}${totalVulnerable > 10 ? '...' : ''}`
        : `✓ All entities have proper XPath constraints (checked ${completedJobs.length} batches)`;
      
      // Update or create check result
      const { error: upsertError } = await supabase
        .from('owasp_check_results')
        .upsert({
          run_id: runId,
          owasp_step_id: typedResult.step_id,
          status,
          details,
          checked_at: new Date().toISOString(),
        }, {
          onConflict: 'run_id,owasp_step_id'
        });
      
      if (upsertError) {
        console.error(`[OWASP Async Worker] Error upserting check result for ${checkType}:`, upsertError);
      }
      
      if (status === 'pass') passCount++;
      else if (status === 'fail') failCount++;
      
      console.log(`[OWASP Async Worker] ${checkType}: ${status} (${totalVulnerable} vulnerabilities)`);
    }

    // Update run status
    const overallStatus = failCount > 0 ? 'fail' : 'pass';
    
    await supabase
      .from('owasp_check_runs')
      .update({
        run_completed_at: new Date().toISOString(),
        overall_status: overallStatus,
        total_checks: Object.keys(aggregatedResults).length,
        passed_checks: passCount,
        failed_checks: failCount,
        warning_checks: 0,
      })
      .eq('id', runId);

    console.log(`[OWASP Async Worker] Updated run ${runId} status to: ${overallStatus} (${passCount} passed, ${failCount} failed)`);
  } catch (error) {
    console.error('[OWASP Async Worker] Error updating run status:', error);
  }
}
