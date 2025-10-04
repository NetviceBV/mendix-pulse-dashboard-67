import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StepResult {
  status: 'pass' | 'fail' | 'error';
  details: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body
    const { credential_id, project_id, environment_name, user_id, run_id, step_id } = await req.json();

    if (!credential_id || !project_id || !environment_name || !user_id) {
      return new Response(
        JSON.stringify({
          status: 'error',
          details: 'Missing required parameters: credential_id, project_id, environment_name, user_id',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[OWASP A01] Queueing anonymous entity access check for project: ${project_id}`);

    // Validate PAT is available (quick check before queuing)
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
          details: 'Personal Access Token (PAT) is required for this check',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if there's already a queued or processing job for this run_id + step_id
    if (run_id && step_id) {
      const { data: existingJob } = await supabase
        .from('owasp_async_jobs')
        .select('id, status')
        .eq('run_id', run_id)
        .eq('step_id', step_id)
        .in('status', ['queued', 'processing'])
        .maybeSingle();

      if (existingJob) {
        console.log(`[OWASP A01] Job already exists: ${existingJob.id} (status: ${existingJob.status})`);
        return new Response(
          JSON.stringify({
            status: 'pending',
            details: 'Security check already queued for processing.',
            job_id: existingJob.id,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Create async job for background processing
    const { data: job, error: jobError } = await supabase
      .from('owasp_async_jobs')
      .insert({
        user_id,
        run_id,
        step_id,
        job_type: 'anonymous-entity-check',
        payload: {
          credential_id,
          project_id,
          environment_name,
          user_id,
        },
        status: 'queued',
      })
      .select()
      .single();

    if (jobError || !job) {
      console.error('[OWASP A01] Failed to create async job:', jobError);
      return new Response(
        JSON.stringify({
          status: 'error',
          details: 'Failed to queue security check',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[OWASP A01] Job ${job.id} queued successfully`);

    // Return pending status immediately
    return new Response(
      JSON.stringify({
        status: 'pending',
        details: 'Security check queued for background processing. This may take several minutes for large applications.',
        job_id: job.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[OWASP A01] Error during analysis:', error);
    return new Response(
      JSON.stringify({
        status: 'error',
        details: `Failed to analyze project: ${error.message}`,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
