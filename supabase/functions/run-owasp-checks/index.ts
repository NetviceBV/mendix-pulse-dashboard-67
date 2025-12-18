import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RAILWAY_ANALYZER_URL = 'https://mendix-analyzer-staging.up.railway.app/analyze';
const RAILWAY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

interface StepResult {
  step_id: string;
  step_name: string;
  status: 'pass' | 'fail' | 'warning' | 'error' | 'pending';
  details: string;
  execution_time_ms: number;
  job_id?: string;
  raw_response?: any;
}

interface A07Settings {
  minimum_length: number;
  require_digit: boolean;
  require_symbol: boolean;
  require_mixed_case: boolean;
  sso_patterns: string[];
}

// Fetch A07 settings with app-specific → user default → system default fallback
async function getA07Settings(
  supabase: any,
  userId: string,
  projectId: string
): Promise<A07Settings> {
  const systemDefaults: A07Settings = {
    minimum_length: 8,
    require_digit: true,
    require_symbol: true,
    require_mixed_case: true,
    sso_patterns: ["saml20", "oidc", "keycloak", "azuread", "okta"],
  };

  // Try app-specific settings first
  const { data: appSettings } = await supabase
    .from('owasp_a07_settings')
    .select('*')
    .eq('user_id', userId)
    .eq('app_id', projectId)
    .maybeSingle();

  if (appSettings) {
    console.log(`[A07 Settings] Using app-specific settings for ${projectId}`);
    return {
      minimum_length: appSettings.minimum_length ?? systemDefaults.minimum_length,
      require_digit: appSettings.require_digit ?? systemDefaults.require_digit,
      require_symbol: appSettings.require_symbol ?? systemDefaults.require_symbol,
      require_mixed_case: appSettings.require_mixed_case ?? systemDefaults.require_mixed_case,
      sso_patterns: appSettings.sso_patterns ?? systemDefaults.sso_patterns,
    };
  }

  // Try user default settings (app_id is null)
  const { data: userDefaults } = await supabase
    .from('owasp_a07_settings')
    .select('*')
    .eq('user_id', userId)
    .is('app_id', null)
    .maybeSingle();

  if (userDefaults) {
    console.log(`[A07 Settings] Using user default settings`);
    return {
      minimum_length: userDefaults.minimum_length ?? systemDefaults.minimum_length,
      require_digit: userDefaults.require_digit ?? systemDefaults.require_digit,
      require_symbol: userDefaults.require_symbol ?? systemDefaults.require_symbol,
      require_mixed_case: userDefaults.require_mixed_case ?? systemDefaults.require_mixed_case,
      sso_patterns: userDefaults.sso_patterns ?? systemDefaults.sso_patterns,
    };
  }

  console.log(`[A07 Settings] Using system defaults`);
  return systemDefaults;
}

// Fetch and cache Railway analysis data
async function fetchAndCacheRailwayAnalysis(
  supabase: any,
  userId: string,
  projectId: string,
  credentialId: string,
  runId: string
): Promise<string | null> {
  console.log(`[Railway Pre-flight] Starting for project: ${projectId}`);

  // Get PAT from credentials
  const { data: credentials, error: credError } = await supabase
    .from('mendix_credentials')
    .select('pat')
    .eq('id', credentialId)
    .eq('user_id', userId)
    .single();

  if (credError || !credentials?.pat) {
    console.log('[Railway Pre-flight] No PAT available, skipping Railway analysis');
    return null;
  }

  // Get A07 settings for password policy & SSO patterns
  const a07Settings = await getA07Settings(supabase, userId, projectId);

  // Build Railway request body
  const railwayParams = {
    personalAccessToken: credentials.pat,
    projectId: projectId,
    passwordPolicy: {
      minimumLength: a07Settings.minimum_length,
      requireDigit: a07Settings.require_digit,
      requireSymbol: a07Settings.require_symbol,
      requireMixedCase: a07Settings.require_mixed_case,
    },
    ssoPatterns: a07Settings.sso_patterns,
  };

  console.log(`[Railway Pre-flight] Calling Railway API with params:`, JSON.stringify({
    projectId: railwayParams.projectId,
    passwordPolicy: railwayParams.passwordPolicy,
    ssoPatterns: railwayParams.ssoPatterns,
  }));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RAILWAY_TIMEOUT_MS);

  try {
    const startTime = Date.now();
    const response = await fetch(RAILWAY_ANALYZER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(railwayParams),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const executionTime = Date.now() - startTime;
    console.log(`[Railway Pre-flight] Railway responded with status: ${response.status} (${executionTime}ms)`);

    const railwayData = await response.json();
    console.log(`[Railway Pre-flight] Response data keys:`, Object.keys(railwayData));

    // Store in cache
    const { data: cacheEntry, error: cacheError } = await supabase
      .from('railway_analysis_cache')
      .insert({
        user_id: userId,
        project_id: projectId,
        run_id: runId,
        analysis_data: railwayData,
        request_parameters: railwayParams,
      })
      .select('id')
      .single();

    if (cacheError) {
      console.error('[Railway Pre-flight] Failed to cache response:', cacheError);
      return null;
    }

    console.log(`[Railway Pre-flight] Cached with ID: ${cacheEntry.id}`);
    return cacheEntry.id;

  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[Railway Pre-flight] Timeout after 10 minutes');
    } else {
      console.error('[Railway Pre-flight] Failed:', error);
    }
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Invalid user token');
    }

    const { project_id, environment_name, credential_id } = await req.json();

    if (!project_id || !environment_name) {
      throw new Error('project_id and environment_name are required');
    }

    // Validate that we're only processing Production environments
    if (environment_name.toLowerCase() !== 'production') {
      return new Response(
        JSON.stringify({
          error: 'OWASP checks can only be run on Production environments',
          environment_received: environment_name
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Starting OWASP checks for project: ${project_id}, environment: ${environment_name}`);

    // Create a new run record
    const { data: runRecord, error: runError } = await supabase
      .from('owasp_check_runs')
      .insert({
        user_id: user.id,
        app_id: project_id,
        environment_name,
        run_started_at: new Date().toISOString(),
        overall_status: 'running',
      })
      .select()
      .single();

    if (runError || !runRecord) {
      console.error('Error creating run record:', runError);
      throw new Error('Failed to create OWASP check run record');
    }

    console.log(`Created run record with ID: ${runRecord.id}`);

    // Get active OWASP items and their steps
    const { data: owaspItems, error: itemsError } = await supabase
      .from('owasp_items')
      .select(`
        id,
        owasp_id,
        title,
        owasp_steps!inner(
          id,
          step_name,
          step_description,
          edge_function_name,
          step_order,
          is_active,
          needs_domain_model,
          needs_railway_analysis
        )
      `)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('owasp_id');

    if (itemsError) {
      console.error('Error fetching OWASP items:', itemsError);
      throw itemsError;
    }

    console.log(`Found ${owaspItems?.length || 0} active OWASP items`);

    const allResults: StepResult[] = [];
    let passCount = 0;
    let failCount = 0;
    let warningCount = 0;

    // Collect all active steps
    const allSteps: any[] = [];
    for (const item of owaspItems || []) {
      const steps = Array.isArray(item.owasp_steps) ? item.owasp_steps : [];
      
      for (const step of steps) {
        if (!step.is_active) continue;
        allSteps.push({
          ...step,
          owasp_id: item.owasp_id,
          owasp_item_id: item.id,
        });
      }
    }

    console.log(`Total active steps to execute: ${allSteps.length}`);

    // Check if any step needs Railway analysis
    const needsRailwayAnalysis = allSteps.some(step => step.needs_railway_analysis);
    let railwayCacheId: string | null = null;

    if (needsRailwayAnalysis && credential_id) {
      console.log('[Orchestrator] Steps require Railway analysis, performing pre-flight call...');
      railwayCacheId = await fetchAndCacheRailwayAnalysis(
        supabase,
        user.id,
        project_id,
        credential_id,
        runRecord.id
      );
      
      if (railwayCacheId) {
        console.log(`[Orchestrator] Railway cache ID: ${railwayCacheId}`);
      } else {
        console.log('[Orchestrator] Railway pre-flight failed or PAT not available');
      }
    }

    // Execute all steps in parallel using Promise.allSettled
    const stepPromises = allSteps.map(async (step) => {
      const startTime = Date.now();
      
      try {
        console.log(`Executing step: ${step.step_name} (function: ${step.edge_function_name})`);

        // Call the edge function for this step
        const { data: functionResult, error: functionError } = await supabase.functions.invoke(
          step.edge_function_name,
          {
            body: {
              project_id,
              app_id: project_id,
              environment_name,
              credential_id,
              user_id: user.id,
              run_id: runRecord.id,
              step_id: step.id,
              owasp_item_id: step.owasp_item_id,
              railway_cache_id: railwayCacheId,  // Pass cache ID to all steps
            },
          }
        );

        const executionTime = Date.now() - startTime;

        if (functionError) {
          console.error(`Error executing function ${step.edge_function_name}:`, functionError);
          return {
            step_id: step.id,
            step_name: step.step_name,
            status: 'error' as const,
            details: `Function error: ${functionError.message}`,
            execution_time_ms: executionTime,
          };
        }

        return {
          step_id: step.id,
          step_name: step.step_name,
          status: functionResult.status || 'error',
          details: functionResult.details || 'No details provided',
          execution_time_ms: executionTime,
          raw_response: functionResult.raw_response,
        };
      } catch (error) {
        console.error(`Exception executing step ${step.step_name}:`, error);
        return {
          step_id: step.id,
          step_name: step.step_name,
          status: 'error' as const,
          details: error instanceof Error ? error.message : 'Unknown error',
          execution_time_ms: Date.now() - startTime,
        };
      }
    });

    // Wait for all steps to complete
    const settledResults = await Promise.allSettled(stepPromises);

    // Process results and store in database
    for (const result of settledResults) {
      if (result.status === 'fulfilled') {
        const stepResult = result.value;

        allResults.push(stepResult);

        // Count results by status
        if (stepResult.status === 'pass') passCount++;
        else if (stepResult.status === 'fail') failCount++;
        else if (stepResult.status === 'warning') warningCount++;

        // Store result in database (upsert to handle re-runs)
        const { error: insertError } = await supabase
          .from('owasp_check_results')
          .upsert({
            user_id: user.id,
            app_id: project_id,
            environment_name,
            owasp_step_id: stepResult.step_id,
            run_id: runRecord.id,
            status: stepResult.status,
            details: stepResult.details,
            execution_time_ms: stepResult.execution_time_ms,
            checked_at: new Date().toISOString(),
            raw_response: stepResult.raw_response || null,
          }, {
            onConflict: 'user_id,app_id,environment_name,owasp_step_id',
          });

        if (insertError) {
          console.error('Error storing check result:', insertError);
        }
      } else {
        // Promise was rejected - create error result
        console.error('Step promise rejected:', result.reason);
        allResults.push({
          step_id: 'unknown',
          step_name: 'Unknown step',
          status: 'error',
          details: `Promise rejection: ${result.reason}`,
          execution_time_ms: 0,
        });
      }
    }

    console.log(`Completed OWASP checks. Total steps executed: ${allResults.length}`);

    // Determine overall status
    let overallStatus: 'pass' | 'fail' | 'warning' = 'pass';
    if (failCount > 0) {
      overallStatus = 'fail';
    } else if (warningCount > 0) {
      overallStatus = 'warning';
    }

    // Update run record with completion data
    const { error: updateError } = await supabase
      .from('owasp_check_runs')
      .update({
        run_completed_at: new Date().toISOString(),
        overall_status: overallStatus,
        total_checks: allResults.length,
        passed_checks: passCount,
        failed_checks: failCount,
        warning_checks: warningCount,
      })
      .eq('id', runRecord.id);

    if (updateError) {
      console.error('Error updating run record:', updateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        run_id: runRecord.id,
        total_steps: allResults.length,
        passed: passCount,
        failed: failCount,
        warnings: warningCount,
        overall_status: overallStatus,
        results: allResults,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in run-owasp-checks:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
