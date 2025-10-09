import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RAILWAY_ANALYZER_URL = 'https://mendix-analyzer-staging.up.railway.app/analyze';
const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

interface RailwaySuccessResponse {
  projectId: string;
  anonymousEnabled: boolean;
  entitiesWithAnonymousAccessNoXPath: Array<{
    module: string;
    name: string;
    qualifiedName: string;
  }>;
  totalEntitiesWithAnonymousAccessNoXPath: number;
}

interface RailwayErrorResponse {
  error: string;
  details: string;
  stack?: string;
  type?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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

    console.log(`[Railway Anonymous Entity Check] Starting for project: ${project_id}`);

    // Get credentials including PAT
    const { data: credentials, error: credError } = await supabase
      .from('mendix_credentials')
      .select('pat')
      .eq('id', credential_id)
      .eq('user_id', user_id)
      .single();

    if (credError || !credentials || !credentials.pat) {
      console.error('[Railway Anonymous Entity Check] PAT not found:', credError);
      return new Response(
        JSON.stringify({
          status: 'error',
          details: 'Personal Access Token (PAT) is required for this check. Please configure PAT in your Mendix credentials.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call Railway API with timeout
    console.log(`[Railway Anonymous Entity Check] Calling Railway API: ${RAILWAY_ANALYZER_URL}`);
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const railwayResponse = await fetch(RAILWAY_ANALYZER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalAccessToken: credentials.pat,
          projectId: project_id,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const executionTime = Date.now() - startTime;

      console.log(`[Railway Anonymous Entity Check] Railway responded with status: ${railwayResponse.status} (${executionTime}ms)`);

      const railwayData = await railwayResponse.json();

      // Log full Railway response for debugging
      console.log('[Railway Anonymous Entity Check] Full Railway response:', JSON.stringify(railwayData, null, 2));

      // Handle Railway error response
      if (railwayData.error || !railwayResponse.ok) {
        const errorResponse = railwayData as RailwayErrorResponse;
        
        // Check for 403 Forbidden error
        if (errorResponse.details?.includes('403') || errorResponse.details?.includes('Forbidden')) {
          console.error('[Railway Anonymous Entity Check] 403 Forbidden:', errorResponse.details);
          return new Response(
            JSON.stringify({
              status: 'error',
              details: `⚠ Access denied: Invalid PAT or insufficient permissions. Railway error: ${errorResponse.details}`,
              raw_response: railwayData, // Include raw response for debugging
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Generic Railway error
        console.error('[Railway Anonymous Entity Check] Railway error:', errorResponse);
        return new Response(
          JSON.stringify({
            status: 'error',
            details: `Railway analysis failed: ${errorResponse.error}. Details: ${errorResponse.details}`,
            raw_response: railwayData, // Include raw response for debugging
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Parse success response
      const result = railwayData as RailwaySuccessResponse;

      // NEW LOGIC: Check anonymousEnabled first
      // Scenario 1: Anonymous Access is Disabled → PASS
      if (!result.anonymousEnabled) {
        console.log('[Railway Anonymous Entity Check] PASS - Anonymous access is disabled');
        return new Response(
          JSON.stringify({
            status: 'pass',
            details: '✓ Anonymous access is disabled for this application',
            raw_response: railwayData,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Scenario 2: Anonymous Access Enabled + No Vulnerable Entities → PASS
      if (result.anonymousEnabled && (result.totalEntitiesWithAnonymousAccessNoXPath ?? 0) === 0) {
        console.log('[Railway Anonymous Entity Check] PASS - Anonymous enabled but no vulnerable entities');
        return new Response(
          JSON.stringify({
            status: 'pass',
            details: '✓ Anonymous access is enabled but all entities have proper XPath constraints',
            raw_response: railwayData,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Scenario 3: Anonymous Access Enabled + Vulnerable Entities Found → FAIL
      const vulnerableEntities = (result.entitiesWithAnonymousAccessNoXPath ?? [])
        .map(e => e.qualifiedName)
        .join(', ');

      console.log(`[Railway Anonymous Entity Check] FAIL - Found ${result.totalEntitiesWithAnonymousAccessNoXPath} vulnerable entities with anonymous access enabled`);
      
      return new Response(
        JSON.stringify({
          status: 'fail',
          details: `✗ SECURITY ISSUE: Found ${result.totalEntitiesWithAnonymousAccessNoXPath} persistable entities with anonymous access and no XPath constraints. Vulnerable entities: ${vulnerableEntities}`,
          raw_response: railwayData,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (fetchError) {
      // Handle timeout or network errors
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.error('[Railway Anonymous Entity Check] Timeout after 10 minutes');
        return new Response(
          JSON.stringify({
            status: 'error',
            details: 'Railway analysis timed out after 10 minutes. The project may be too large. Please contact support.',
          }),
          { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.error('[Railway Anonymous Entity Check] Network error:', fetchError);
      return new Response(
        JSON.stringify({
          status: 'error',
          details: `Network error calling Railway API: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('[Railway Anonymous Entity Check] Unexpected error:', error);
    return new Response(
      JSON.stringify({
        status: 'error',
        details: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
