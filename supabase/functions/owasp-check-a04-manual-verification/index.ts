import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ManualCheckUrl {
  id: string;
  url: string;
  description: string | null;
  display_order: number;
}

interface ManualVerification {
  id: string;
  verified_at: string;
  verified_by: string | null;
  notes: string | null;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body - get user_id from body (passed by run-owasp-checks)
    const { app_id, environment_name, owasp_item_id, user_id } = await req.json();
    
    console.log('[A04 Manual Verification Check] Request:', { 
      user_id, 
      app_id, 
      environment_name, 
      owasp_item_id 
    });

    if (!owasp_item_id || !user_id) {
      return new Response(
        JSON.stringify({ status: 'error', details: 'owasp_item_id and user_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the OWASP item to check expiration_months
    const { data: owaspItem, error: owaspItemError } = await supabase
      .from('owasp_items')
      .select('id, owasp_id, title, expiration_months')
      .eq('id', owasp_item_id)
      .eq('user_id', user_id)
      .single();

    if (owaspItemError || !owaspItem) {
      console.error('[A04 Manual Verification Check] OWASP item not found:', owaspItemError);
      return new Response(
        JSON.stringify({ status: 'error', details: 'OWASP item not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch configured URLs for this OWASP item
    const { data: urls, error: urlsError } = await supabase
      .from('owasp_manual_check_urls')
      .select('id, url, description, display_order')
      .eq('user_id', user_id)
      .eq('owasp_item_id', owasp_item_id)
      .order('display_order', { ascending: true });

    if (urlsError) {
      console.error('[A04 Manual Verification Check] Error fetching URLs:', urlsError);
      return new Response(
        JSON.stringify({ status: 'error', details: 'Failed to fetch verification URLs' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If no URLs configured, return warning
    if (!urls || urls.length === 0) {
      console.log('[A04 Manual Verification Check] No URLs configured');
      return new Response(
        JSON.stringify({
          status: 'warning',
          details: 'No verification URLs configured. Add URLs in OWASP Settings to enable this check.',
          urls: [],
          verification: null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch latest verification for this app/environment
    const { data: verification, error: verificationError } = await supabase
      .from('owasp_manual_verifications')
      .select('id, verified_at, verified_by, notes')
      .eq('user_id', user_id)
      .eq('owasp_item_id', owasp_item_id)
      .eq('app_id', app_id)
      .eq('environment_name', environment_name || 'Production')
      .single();

    // If no verification exists, fail
    if (verificationError || !verification) {
      console.log('[A04 Manual Verification Check] Never verified');
      return new Response(
        JSON.stringify({
          status: 'fail',
          details: `URLs have never been verified for this environment. Please review the ${urls.length} configured URL(s) and mark as verified.`,
          urls: urls as ManualCheckUrl[],
          verification: null,
          expiration_months: owaspItem.expiration_months,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if verification has expired
    const verifiedAt = new Date(verification.verified_at);
    const expirationDate = new Date(verifiedAt);
    expirationDate.setMonth(expirationDate.getMonth() + owaspItem.expiration_months);
    const now = new Date();

    if (now > expirationDate) {
      console.log('[A04 Manual Verification Check] Verification expired:', {
        verified_at: verification.verified_at,
        expiration_date: expirationDate.toISOString(),
        expiration_months: owaspItem.expiration_months,
      });
      return new Response(
        JSON.stringify({
          status: 'fail',
          details: `Verification expired on ${expirationDate.toLocaleDateString()}. Last verified: ${verifiedAt.toLocaleDateString()}. Please re-verify the ${urls.length} configured URL(s).`,
          urls: urls as ManualCheckUrl[],
          verification: verification as ManualVerification,
          expiration_months: owaspItem.expiration_months,
          expiration_date: expirationDate.toISOString(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verification is valid
    console.log('[A04 Manual Verification Check] Verification valid:', {
      verified_at: verification.verified_at,
      expiration_date: expirationDate.toISOString(),
    });
    return new Response(
      JSON.stringify({
        status: 'pass',
        details: `Last verified: ${verifiedAt.toLocaleDateString()}. Valid until: ${expirationDate.toLocaleDateString()}. ${urls.length} URL(s) configured.`,
        urls: urls as ManualCheckUrl[],
        verification: verification as ManualVerification,
        expiration_months: owaspItem.expiration_months,
        expiration_date: expirationDate.toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[A04 Manual Verification Check] Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        status: 'error', 
        details: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
