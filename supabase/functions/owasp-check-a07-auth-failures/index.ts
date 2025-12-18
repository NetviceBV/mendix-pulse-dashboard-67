import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PasswordPolicy {
  current: {
    minimumLength: number;
    requireDigit: boolean;
    requireSymbol: boolean;
    requireMixedCase: boolean;
  } | null;
  required: {
    minimumLength: number;
    requireDigit: boolean;
    requireSymbol: boolean;
    requireMixedCase: boolean;
  } | null;
  isCompliant: boolean;
  skipped?: boolean;
  reason?: string;
  issues?: Array<{
    property: string;
    current: any;
    required: any;
    message: string;
  }>;
}

interface SSOModule {
  name: string;
  matchedPattern: string;
}

interface RailwayAnalysisData {
  projectId: string;
  workingCopyId?: string;
  anonymousEnabled: boolean;
  hasSSOModule: boolean;
  ssoModules: SSOModule[];
  passwordPolicy: PasswordPolicy;
  entitiesWithAnonymousAccessNoXPath?: any[];
  totalEntitiesWithAnonymousAccessNoXPath?: number;
  error?: string;
  details?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { railway_cache_id, user_id, project_id, environment_name } = await req.json();

    console.log(`[A07] Starting authentication check for project: ${project_id}`);

    // Require cached Railway analysis
    if (!railway_cache_id) {
      console.log('[A07] No Railway cache ID provided');
      return new Response(
        JSON.stringify({
          status: 'warning',
          details: 'Railway analysis not available. Configure PAT in credentials and ensure A07 settings are configured. The orchestrator performs Railway analysis when PAT is available.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Read cached Railway response
    const { data: cached, error: cacheError } = await supabase
      .from('railway_analysis_cache')
      .select('analysis_data')
      .eq('id', railway_cache_id)
      .single();

    if (cacheError || !cached) {
      console.error('[A07] Failed to read cache:', cacheError);
      return new Response(
        JSON.stringify({
          status: 'error',
          details: 'Failed to read Railway analysis cache. Please retry the OWASP check.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = cached.analysis_data as RailwayAnalysisData;
    console.log(`[A07] Evaluating - hasSSOModule: ${data.hasSSOModule}, isCompliant: ${data.passwordPolicy?.isCompliant}`);

    // Handle Railway errors
    if (data.error) {
      return new Response(
        JSON.stringify({
          status: 'error',
          details: `Railway analysis failed: ${data.error}. ${data.details || ''}`,
          raw_response: data,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // A07 EVALUATION LOGIC
    // ============================================

    // CASE 1: SSO Module detected → PASS
    if (data.hasSSOModule === true) {
      const ssoNames = data.ssoModules?.map((m) => m.name).join(', ') || 'Unknown';
      console.log(`[A07] PASS - SSO modules detected: ${ssoNames}`);
      
      return new Response(
        JSON.stringify({
          status: 'pass',
          details: `✓ SSO modules detected: ${ssoNames}\n\nPassword policy check skipped - SSO provides authentication.`,
          raw_response: data,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CASE 2: No SSO, check password policy compliance
    const pp = data.passwordPolicy;

    if (!pp) {
      console.log('[A07] ERROR - No password policy data');
      return new Response(
        JSON.stringify({
          status: 'error',
          details: 'Password policy data not available in Railway response. This may indicate a Railway API issue.',
          raw_response: data,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CASE 2a: Password policy is compliant → PASS
    if (pp.isCompliant === true) {
      const current = pp.current;
      console.log('[A07] PASS - Password policy is compliant');
      
      return new Response(
        JSON.stringify({
          status: 'pass',
          details: `✓ No SSO modules found, but password policy meets requirements:\n\n` +
            `• Minimum length: ${current?.minimumLength || 'N/A'}\n` +
            `• Require digit: ${current?.requireDigit ? 'Yes' : 'No'}\n` +
            `• Require symbol: ${current?.requireSymbol ? 'Yes' : 'No'}\n` +
            `• Require mixed case: ${current?.requireMixedCase ? 'Yes' : 'No'}`,
          raw_response: data,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CASE 2b: Password policy is NOT compliant → FAIL
    console.log('[A07] FAIL - Password policy is not compliant');
    
    const issues = pp.issues || [];
    const issueMessages = issues.map((i) => `• ${i.message}`).join('\n');
    
    const currentPolicy = pp.current 
      ? `**Current Policy:**\n• Length: ${pp.current.minimumLength}\n• Digit required: ${pp.current.requireDigit ? 'Yes' : 'No'}\n• Symbol required: ${pp.current.requireSymbol ? 'Yes' : 'No'}\n• Mixed case required: ${pp.current.requireMixedCase ? 'Yes' : 'No'}`
      : '**Current Policy:** Not configured';
    
    const requiredPolicy = pp.required
      ? `**Required Policy:**\n• Length: ${pp.required.minimumLength}\n• Digit required: ${pp.required.requireDigit ? 'Yes' : 'No'}\n• Symbol required: ${pp.required.requireSymbol ? 'Yes' : 'No'}\n• Mixed case required: ${pp.required.requireMixedCase ? 'Yes' : 'No'}`
      : '';

    return new Response(
      JSON.stringify({
        status: 'fail',
        details: `✗ No SSO modules found and password policy does not meet requirements:\n\n` +
          `**Issues Found:**\n${issueMessages || '• Password policy configuration issues detected'}\n\n` +
          `${currentPolicy}\n\n${requiredPolicy}`,
        raw_response: data,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[A07] Unexpected error:', error);
    return new Response(
      JSON.stringify({
        status: 'error',
        details: `Unexpected error evaluating A07: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
