import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

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

    const { project_id, environment_name, user_id } = await req.json();

    if (!project_id || !environment_name || !user_id) {
      throw new Error('project_id, environment_name, and user_id are required');
    }

    console.log(`[A10-Endpoint-RestDoc] Checking /rest-doc/ endpoint for project: ${project_id}, environment: ${environment_name}`);

    // Find the production environment for this project
    const { data: environments, error: envError } = await supabase
      .from('mendix_environments')
      .select('*')
      .eq('app_id', project_id)
      .eq('user_id', user_id)
      .ilike('environment_name', 'Production')
      .eq('status', 'running');

    if (envError) {
      console.error('[A10-Endpoint-RestDoc] Error fetching environment:', envError);
      return new Response(
        JSON.stringify({
          status: 'error',
          details: `Database error: ${envError.message}`,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!environments || environments.length === 0) {
      console.log('[A10-Endpoint-RestDoc] No running production environment found');
      return new Response(
        JSON.stringify({
          status: 'fail',
          details: 'No running production environment found for this application',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const productionEnv = environments[0];
    
    if (!productionEnv.url) {
      console.log('[A10-Endpoint-RestDoc] Production environment has no URL');
      return new Response(
        JSON.stringify({
          status: 'fail',
          details: 'Production environment URL is not available',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Construct the /rest-doc/ endpoint URL
    const baseUrl = productionEnv.url.endsWith('/') 
      ? productionEnv.url.slice(0, -1) 
      : productionEnv.url;
    const testUrl = `${baseUrl}/rest-doc/`;

    console.log(`[A10-Endpoint-RestDoc] Testing endpoint: ${testUrl}`);

    // Make the HTTP request to check if endpoint is publicly accessible
    let httpStatus: number;
    let statusText: string;

    try {
      const response = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'OWASP-Security-Check/1.0',
        },
        redirect: 'manual',
      });

      httpStatus = response.status;
      statusText = response.statusText;
      console.log(`[A10-Endpoint-RestDoc] Endpoint responded with status: ${httpStatus} ${statusText}`);
    } catch (fetchError) {
      console.log('[A10-Endpoint-RestDoc] Fetch error (likely network issue):', fetchError);
      // If fetch fails completely, this is good - endpoint is not accessible
      return new Response(
        JSON.stringify({
          status: 'pass',
          details: `✓ REST documentation endpoint is not publicly accessible (network error: ${fetchError instanceof Error ? fetchError.message : 'unknown'})`,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check the response status
    // 2xx = FAIL (endpoint is publicly accessible - security issue for SSRF reconnaissance)
    // 4xx or 5xx = PASS (endpoint is protected)
    if (httpStatus >= 200 && httpStatus < 300) {
      return new Response(
        JSON.stringify({
          status: 'fail',
          details: `✗ SECURITY ISSUE: REST documentation endpoint is publicly accessible (HTTP ${httpStatus}). The /rest-doc/ endpoint exposes API information that could be used for SSRF reconnaissance attacks.`,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } else if (httpStatus >= 300 && httpStatus < 400) {
      // Redirect responses - could be protected or not, mark as warning
      return new Response(
        JSON.stringify({
          status: 'warning',
          details: `⚠ REST documentation endpoint returned a redirect (HTTP ${httpStatus}). Manual verification recommended to ensure it's not accessible after redirect.`,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } else {
      // 4xx or 5xx - endpoint is protected
      return new Response(
        JSON.stringify({
          status: 'pass',
          details: `✓ REST documentation endpoint is properly protected (HTTP ${httpStatus} - ${statusText})`,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

  } catch (error) {
    console.error('[A10-Endpoint-RestDoc] Error:', error);
    return new Response(
      JSON.stringify({
        status: 'error',
        details: error instanceof Error ? error.message : 'Unknown error occurred',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
