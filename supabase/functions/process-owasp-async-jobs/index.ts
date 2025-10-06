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
        console.log(`[OWASP Async Worker] Processing job ${job.id} (attempt ${job.attempts + 1}/${job.max_attempts})`);

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

        if (job.job_type === 'anonymous-entity-check') {
          // Check if this is a discovery job or a batch processing job
          if (job.payload.batch_mode === 'discovery') {
            // Discovery job: count domain models and queue batch jobs
            result = await discoverAndQueueBatches(job, supabase);
          } else {
            // Batch processing job: analyze assigned domain models
            result = await executeAnonymousEntityCheck(job.payload, supabase);
          }
          
          if (result.status === 'error') {
            error_message = result.details;
          }
        } else {
          error_message = `Unknown job type: ${job.job_type}`;
          result = { status: 'error', details: error_message };
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

        // Update the corresponding owasp_check_results
        if (job.run_id && job.step_id) {
          await supabase
            .from('owasp_check_results')
            .update({
              status: result.status,
              details: result.details,
            })
            .eq('run_id', job.run_id)
            .eq('owasp_step_id', job.step_id);

          // Update the run's overall status if all jobs are complete
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

// Discovery job: count domain models and queue batch jobs
async function discoverAndQueueBatches(job: any, supabase: any): Promise<{ status: string; details: string }> {
  try {
    const { credential_id, project_id, environment_name, user_id } = job.payload;
    const { run_id, step_id } = job;

    console.log(`[Discovery] Starting discovery for project: ${project_id}`);

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

    // Calculate batches (5 domain models per batch)
    const MODELS_PER_BATCH = 5;
    const totalBatches = Math.ceil(totalDomainModels / MODELS_PER_BATCH);
    
    console.log(`[Discovery] Creating ${totalBatches} batch jobs (${MODELS_PER_BATCH} models per batch)`);

    // Create batch jobs
    const batchJobs = [];
    for (let i = 0; i < totalBatches; i++) {
      const startIndex = i * MODELS_PER_BATCH;
      const endIndex = Math.min(startIndex + MODELS_PER_BATCH, totalDomainModels);
      
      batchJobs.push({
        user_id,
        run_id,
        step_id,
        job_type: 'anonymous-entity-check',
        payload: {
          credential_id,
          project_id,
          environment_name,
          user_id,
          batch_mode: 'process',
          batch_number: i,
          total_batches: totalBatches,
          domain_model_start: startIndex,
          domain_model_end: endIndex,
        },
        status: 'queued',
      });
    }

    // Insert all batch jobs
    const { error: batchError } = await supabase
      .from('owasp_async_jobs')
      .insert(batchJobs);

    if (batchError) {
      console.error('[Discovery] Failed to create batch jobs:', batchError);
      return {
        status: 'error',
        details: `Failed to create batch jobs: ${batchError.message}`,
      };
    }

    console.log(`[Discovery] Successfully queued ${totalBatches} batch jobs`);

    return {
      status: 'pass',
      details: `Discovery complete: ${totalDomainModels} domain models found, ${totalBatches} batch jobs created`,
    };

  } catch (error) {
    console.error('[Discovery] Error during discovery:', error);
    return {
      status: 'error',
      details: `Failed to discover domain models: ${getErrorMessage(error)}`,
    };
  }
}

// Execute the anonymous entity access check for a batch of domain models
async function executeAnonymousEntityCheck(payload: any, supabase: any): Promise<{ status: string; details: string }> {
  try {
    const { credential_id, project_id, environment_name, user_id, batch_number, total_batches, domain_model_start, domain_model_end } = payload;

    console.log(`[Batch ${batch_number + 1}/${total_batches}] Starting for project: ${project_id}, models ${domain_model_start}-${domain_model_end - 1}`);

    console.log(`[Anonymous Check] Starting for project: ${project_id}`);

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

    const model = await workingCopy.openModel();
    console.log(`[Batch ${batch_number + 1}/${total_batches}] Model opened successfully`);

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

    // Get ProjectSecurity
    const allSecurityUnits = model.allProjectSecurities();
    console.log(`[Batch ${batch_number + 1}/${total_batches}] Found ${allSecurityUnits.length} project security units`);
    
    if (allSecurityUnits.length === 0) {
      return {
        status: 'pass',
        details: '✓ No project security configuration found',
      };
    }
    
    const projectSecurity = allSecurityUnits[0];
    await projectSecurity.load();
    
    if (!projectSecurity.enableGuestAccess) {
      return {
        status: 'pass',
        details: '✓ Anonymous/guest access is not enabled in this application',
      };
    }
    
    const guestUserRoleName = projectSecurity.guestUserRoleName;
    
    if (!guestUserRoleName) {
      return {
        status: 'pass',
        details: '✓ Guest access is enabled but no guest user role is configured',
      };
    }
    
    console.log(`[Batch ${batch_number + 1}/${total_batches}] Guest/Anonymous role name: ${guestUserRoleName}`);
    
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
    
    if (!guestUserRole) {
      return {
        status: 'pass',
        details: '✓ Guest user role exists but has no module roles mapped',
      };
    }
    
    for (const moduleRole of guestUserRole.moduleRoles) {
      if (moduleRole && moduleRole.name && moduleRole.qualifiedName) {
        guestModuleRoles.push({
          name: moduleRole.name,
          qualifiedName: moduleRole.qualifiedName
        });
      }
    }
    
    if (guestModuleRoles.length === 0) {
      return {
        status: 'pass',
        details: '✓ Guest user role exists but has no module roles mapped',
      };
    }

    // Get all domain models and slice to the batch range
    const allDomainModels = model.allDomainModels();
    const domainModels = allDomainModels.slice(domain_model_start, domain_model_end);
    console.log(`[Batch ${batch_number + 1}/${total_batches}] Processing ${domainModels.length} domain models (${domain_model_start}-${domain_model_end - 1} of ${allDomainModels.length} total)`);

    const entitiesWithAnonymousAccessNoXPath: Array<{ module: string; name: string; qualifiedName: string }> = [];

    for (const domainModel of domainModels) {
      await domainModel.load();
      const moduleName = domainModel.containerAsModule ? domainModel.containerAsModule.name : 'Unknown';

      for (const entity of domainModel.entities) {
        if (!(entity instanceof domainmodels.Entity)) continue;
        if (!entity) continue;

        await entity.load();
        
        const entityName = entity.name || 'UnknownEntity';
        const entityQualifiedName = entity.qualifiedName || 'Unknown';

        const persistable = await isPersistable(entity);
        
        if (!persistable) continue;

        const accessRules = entity.accessRules || [];
        
        const anonymousAccessRules = accessRules.filter((rule: any) => {
          if (!rule || !rule.moduleRoles) return false;
          return rule.moduleRoles.some((moduleRole: any) => {
            if (!moduleRole) return false;
            return guestModuleRoles.some(guestModuleRole => 
              moduleRole.qualifiedName === guestModuleRole.qualifiedName
            );
          });
        });

        if (anonymousAccessRules.length > 0) {
          const hasRuleWithoutXPath = anonymousAccessRules.some((rule: any) => 
            !rule.xPathConstraint || rule.xPathConstraint.trim() === ''
          );
          
          if (hasRuleWithoutXPath) {
            entitiesWithAnonymousAccessNoXPath.push({
              module: moduleName,
              name: entityName,
              qualifiedName: entityQualifiedName
            });
          }
        }
      }
    }

    const totalVulnerable = entitiesWithAnonymousAccessNoXPath.length;

    console.log(`[Batch ${batch_number + 1}/${total_batches}] Found ${totalVulnerable} vulnerable entities in this batch`);

    // For batch jobs, we store partial results and return success
    // The final aggregation happens in updateRunStatus when all batches complete
    if (totalVulnerable === 0) {
      return {
        status: 'pass',
        details: `Batch ${batch_number + 1}/${total_batches}: No vulnerable entities found`,
      };
    }

    const entityList = entitiesWithAnonymousAccessNoXPath
      .map(e => `${e.module}.${e.name}`)
      .join(', ');

    return {
      status: 'fail',
      details: `Batch ${batch_number + 1}/${total_batches}: Found ${totalVulnerable} vulnerable entit${totalVulnerable === 1 ? 'y' : 'ies'}: ${entityList}`,
    };

  } catch (error) {
    console.error(`[Batch ${payload.batch_number + 1}/${payload.total_batches}] Error during analysis:`, error);
    return {
      status: 'error',
      details: `Batch ${payload.batch_number + 1}/${payload.total_batches} failed: ${getErrorMessage(error)}`,
    };
  }
}

// Update the run's overall status based on all check results
async function updateRunStatus(supabase: any, runId: string): Promise<void> {
  try {
    // Check if there are any pending jobs for this run
    const { data: pendingJobs } = await supabase
      .from('owasp_async_jobs')
      .select('id, payload')
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
      .eq('job_type', 'anonymous-entity-check')
      .eq('status', 'completed');

    if (jobsError || !completedJobs) {
      console.error('[OWASP Async Worker] Error fetching completed jobs:', jobsError);
      return;
    }

    // Filter out discovery jobs and aggregate batch results
    const batchJobs = completedJobs.filter(job => job.payload?.batch_mode === 'process');
    
    console.log(`[OWASP Async Worker] Aggregating ${batchJobs.length} batch jobs`);

    let hasFailures = false;
    let allVulnerableEntities: string[] = [];
    let allPassedBatches = 0;
    let allFailedBatches = 0;

    for (const job of batchJobs) {
      if (job.result?.status === 'fail') {
        hasFailures = true;
        allFailedBatches++;
        // Extract entity names from batch details
        const details = job.result.details || '';
        const match = details.match(/Found \d+ vulnerable entit(?:y|ies): (.+)$/);
        if (match) {
          const entities = match[1].split(', ');
          allVulnerableEntities.push(...entities);
        }
      } else if (job.result?.status === 'pass') {
        allPassedBatches++;
      }
    }

    // Get the owasp_check_results record to update
    const { data: checkResults } = await supabase
      .from('owasp_check_results')
      .select('*')
      .eq('run_id', runId)
      .limit(1);

    if (checkResults && checkResults.length > 0) {
      const checkResult = checkResults[0];
      
      // Determine final status and details
      let finalStatus: string;
      let finalDetails: string;

      if (hasFailures) {
        finalStatus = 'fail';
        const totalVulnerable = allVulnerableEntities.length;
        const entityList = allVulnerableEntities.join(', ');
        finalDetails = `✗ SECURITY ISSUE: Found ${totalVulnerable} persistable entit${totalVulnerable === 1 ? 'y' : 'ies'} with anonymous access and no XPath constraints across all batches. Entities: ${entityList}`;
      } else {
        finalStatus = 'pass';
        finalDetails = `✓ Anonymous access is enabled but all entities have XPath constraints (checked ${batchJobs.length} batches)`;
      }

      // Update the check result with aggregated findings
      await supabase
        .from('owasp_check_results')
        .update({
          status: finalStatus,
          details: finalDetails,
        })
        .eq('id', checkResult.id);

      console.log(`[OWASP Async Worker] Updated check result with aggregated findings: ${finalStatus}`);
    }

    // Update run status
    const overallStatus = hasFailures ? 'fail' : 'pass';
    
    await supabase
      .from('owasp_check_runs')
      .update({
        run_completed_at: new Date().toISOString(),
        overall_status: overallStatus,
        total_checks: 1,
        passed_checks: hasFailures ? 0 : 1,
        failed_checks: hasFailures ? 1 : 0,
        warning_checks: 0,
      })
      .eq('id', runId);

    console.log(`[OWASP Async Worker] Updated run ${runId} status to: ${overallStatus} (${allPassedBatches} passed batches, ${allFailedBatches} failed batches)`);
  } catch (error) {
    console.error('[OWASP Async Worker] Error updating run status:', error);
  }
}
