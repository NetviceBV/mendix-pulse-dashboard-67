import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StepResult {
  step_id: string;
  step_name: string;
  status: 'pass' | 'fail' | 'warning' | 'error' | 'pending';
  details: string;
  execution_time_ms: number;
  job_id?: string;
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
          needs_domain_model
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

    // Separate steps into those needing domain model and those that don't
    const modelSteps: any[] = [];
    const nonModelSteps: any[] = [];

    for (const item of owaspItems || []) {
      const steps = Array.isArray(item.owasp_steps) ? item.owasp_steps : [];
      
      for (const step of steps) {
        if (!step.is_active) continue;
        
        // Check if this step needs domain model access
        if (step.needs_domain_model) {
          modelSteps.push({
            ...step,
            owasp_id: item.owasp_id,
          });
        } else {
          nonModelSteps.push(step);
        }
      }
    }

    console.log(`Model-dependent steps: ${modelSteps.length}, Non-model steps: ${nonModelSteps.length}`);

    // If there are steps needing domain model, call orchestrator ONCE
    if (modelSteps.length > 0) {
      console.log('Invoking orchestrator for domain model checks...');
      
      const startTime = Date.now();
      
      const { data: orchestratorResult, error: orchestratorError } = await supabase.functions.invoke(
        'owasp-discovery-orchestrator',
        {
          body: {
            credential_id,
            project_id,
            environment_name,
            user_id: user.id,
            run_id: runRecord.id,
            checks_to_run: modelSteps.map(s => ({
              step_id: s.id,
              check_type: `${s.owasp_id}-${s.step_name.toLowerCase().replace(/\s+/g, '-')}`,
              step_name: s.step_name,
              owasp_id: s.owasp_id
            }))
          }
        }
      );

      const executionTime = Date.now() - startTime;

      if (orchestratorError) {
        console.error('Error invoking orchestrator:', orchestratorError);
        
        // Create error results for all model steps
        for (const step of modelSteps) {
          allResults.push({
            step_id: step.id,
            step_name: step.step_name,
            status: 'error',
            details: `Orchestrator error: ${orchestratorError.message}`,
            execution_time_ms: executionTime,
          });
        }
      } else {
        // Create pending results for model-based checks (will be updated by batches)
        for (const step of modelSteps) {
          allResults.push({
            step_id: step.id,
            step_name: step.step_name,
            status: 'pending',
            details: orchestratorResult.details || 'Queued for batch processing',
            execution_time_ms: executionTime,
            job_id: orchestratorResult.job_id,
          });
          
          // Store placeholder result in database
          await supabase
            .from('owasp_check_results')
            .insert({
              user_id: user.id,
              app_id: project_id,
              environment_name,
              owasp_step_id: step.id,
              run_id: runRecord.id,
              status: 'pending',
              details: orchestratorResult.details || 'Queued for batch processing',
              execution_time_ms: executionTime,
              checked_at: new Date().toISOString(),
              job_id: orchestratorResult.job_id,
            });
        }
      }
    }

    // Process non-model steps normally
    for (const step of nonModelSteps) {

        const startTime = Date.now();
        let stepResult: StepResult = {
          step_id: step.id,
          step_name: step.step_name,
          status: 'error',
          details: 'Step execution failed',
          execution_time_ms: 0,
        };

        try {
          console.log(`Executing step: ${step.step_name} (function: ${step.edge_function_name})`);

          // Call the edge function for this step
          const { data: functionResult, error: functionError } = await supabase.functions.invoke(
            step.edge_function_name,
            {
              body: {
                project_id,
                environment_name,
                credential_id,
                user_id: user.id,
                run_id: runRecord.id,
                step_id: step.id,
              },
            }
          );

          const executionTime = Date.now() - startTime;

          if (functionError) {
            console.error(`Error executing function ${step.edge_function_name}:`, functionError);
            stepResult = {
              step_id: step.id,
              step_name: step.step_name,
              status: 'error',
              details: `Function error: ${functionError.message}`,
              execution_time_ms: executionTime,
            };
          } else {
            stepResult = {
              step_id: step.id,
              step_name: step.step_name,
              status: functionResult.status || 'error',
              details: functionResult.details || 'No details provided',
              execution_time_ms: executionTime,
              job_id: functionResult.job_id, // Store job_id for async jobs
            };
          }
        } catch (error) {
          console.error(`Exception executing step ${step.step_name}:`, error);
          stepResult = {
            step_id: step.id,
            step_name: step.step_name,
            status: 'error',
            details: error instanceof Error ? error.message : 'Unknown error',
            execution_time_ms: Date.now() - startTime,
          };
        }

        allResults.push(stepResult);

        // Count results by status (don't count pending in final tallies)
        if (stepResult.status === 'pass') passCount++;
        else if (stepResult.status === 'fail') failCount++;
        else if (stepResult.status === 'warning') warningCount++;

        // Store result in database with run_id
        const insertData: any = {
          user_id: user.id,
          app_id: project_id,
          environment_name,
          owasp_step_id: step.id,
          run_id: runRecord.id,
          status: stepResult.status,
          details: stepResult.details,
          execution_time_ms: stepResult.execution_time_ms,
          checked_at: new Date().toISOString(),
        };

        // Store job_id for async jobs
        if (stepResult.job_id) {
          insertData.job_id = stepResult.job_id;
        }

        const { error: insertError } = await supabase
          .from('owasp_check_results')
          .insert(insertData);

        if (insertError) {
          console.error('Error storing check result:', insertError);
        }
    }

    console.log(`Completed OWASP checks. Total steps executed: ${allResults.length}`);

    // Check if any results are pending
    const hasPendingResults = allResults.some(r => r.status === 'pending');

    // Determine overall status
    let overallStatus: 'pass' | 'fail' | 'warning' | 'running' = 'pass';
    if (hasPendingResults) {
      overallStatus = 'running'; // Keep as running if there are pending async jobs
    } else if (failCount > 0) {
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
