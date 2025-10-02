import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StepResult {
  step_id: string;
  step_name: string;
  status: 'pass' | 'fail' | 'warning' | 'error';
  details: string;
  execution_time_ms: number;
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
          is_active
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

    // Process each OWASP item and its steps
    for (const item of owaspItems || []) {
      const steps = Array.isArray(item.owasp_steps) ? item.owasp_steps : [];
      
      for (const step of steps) {
        if (!step.is_active) continue;

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

        // Store result in database
        const { error: insertError } = await supabase
          .from('owasp_check_results')
          .insert({
            user_id: user.id,
            app_id: project_id,
            environment_name,
            owasp_step_id: step.id,
            status: stepResult.status,
            details: stepResult.details,
            execution_time_ms: stepResult.execution_time_ms,
            checked_at: new Date().toISOString(),
          });

        if (insertError) {
          console.error('Error storing check result:', insertError);
        }
      }
    }

    console.log(`Completed OWASP checks. Total steps executed: ${allResults.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        total_steps: allResults.length,
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
