import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CheckToRun {
  step_id: string;
  check_type: string;
  step_name: string;
  owasp_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { 
      credential_id, 
      project_id, 
      environment_name, 
      user_id, 
      run_id, 
      checks_to_run 
    } = await req.json();

    console.log(`[OWASP Discovery Orchestrator] Starting for project: ${project_id}`);
    console.log(`[OWASP Discovery Orchestrator] Checks to run: ${checks_to_run.length}`);

    if (!credential_id || !project_id || !environment_name || !user_id || !run_id || !checks_to_run) {
      return new Response(
        JSON.stringify({ 
          status: 'error', 
          details: 'Missing required parameters' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate that PAT is available
    const { data: credentials, error: credError } = await supabase
      .from('mendix_credentials')
      .select('pat')
      .eq('id', credential_id)
      .eq('user_id', user_id)
      .single();

    if (credError || !credentials || !credentials.pat) {
      return new Response(
        JSON.stringify({ 
          status: 'error', 
          details: 'PAT (Personal Access Token) is required for domain model checks' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Check if there's already a discovery job queued/processing for this run
    const { data: existingJobs } = await supabase
      .from('owasp_async_jobs')
      .select('id, status')
      .eq('run_id', run_id)
      .eq('job_type', 'discovery')
      .in('status', ['queued', 'processing'])
      .limit(1);

    if (existingJobs && existingJobs.length > 0) {
      console.log('[OWASP Discovery Orchestrator] Discovery job already exists for this run');
      return new Response(
        JSON.stringify({ 
          status: 'pending', 
          details: 'Discovery already in progress',
          job_id: existingJobs[0].id
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Create the discovery job
    const { data: job, error: jobError } = await supabase
      .from('owasp_async_jobs')
      .insert({
        user_id,
        run_id,
        step_id: null, // Discovery job has no single step
        job_type: 'discovery',
        payload: {
          credential_id,
          project_id,
          environment_name,
          user_id,
          checks_to_run, // Pass all checks to the discovery job
        },
        status: 'queued',
      })
      .select()
      .single();

    if (jobError || !job) {
      console.error('[OWASP Discovery Orchestrator] Failed to create discovery job:', jobError);
      return new Response(
        JSON.stringify({ 
          status: 'error', 
          details: `Failed to queue discovery job: ${jobError?.message || 'Unknown error'}` 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`[OWASP Discovery Orchestrator] Discovery job queued with ID: ${job.id}`);

    return new Response(
      JSON.stringify({ 
        status: 'pending', 
        details: `Discovery job queued for ${checks_to_run.length} checks`,
        job_id: job.id
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('[OWASP Discovery Orchestrator] Error:', error);
    return new Response(
      JSON.stringify({ 
        status: 'error', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
