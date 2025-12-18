import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getErrorMessage } from '../_shared/error-utils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CheckResult {
  status: 'pass' | 'fail' | 'warning' | 'error';
  details: string;
  environmentUrl?: string;
  isMendixCloud?: boolean;
  verificationDate?: string;
  expirationDate?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { app_id, environment_name, user_id, owasp_item_id } = await req.json();

    console.log('[A08] Starting integrity check:', { app_id, environment_name, user_id });

    if (!app_id || !user_id) {
      return new Response(
        JSON.stringify({ 
          status: 'error', 
          details: 'Missing required parameters: app_id or user_id' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the production environment URL
    const { data: environment, error: envError } = await supabase
      .from('mendix_environments')
      .select('url, environment_name')
      .eq('app_id', app_id)
      .eq('user_id', user_id)
      .ilike('environment_name', 'production')
      .single();

    if (envError || !environment) {
      console.log('[A08] No production environment found:', envError?.message);
      return new Response(
        JSON.stringify({
          status: 'warning',
          details: 'No production environment found for this application.',
        } as CheckResult),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const environmentUrl = environment.url || '';
    console.log('[A08] Production environment URL:', environmentUrl);

    // Check if hosted on Mendix Cloud
    const isMendixCloud = environmentUrl.toLowerCase().includes('mendixcloud.com');

    if (isMendixCloud) {
      console.log('[A08] Application hosted on Mendix Cloud - auto-pass');
      return new Response(
        JSON.stringify({
          status: 'pass',
          details: 'Application is hosted on Mendix Cloud. Software and data integrity is managed by the Mendix platform with automatic security updates, signed deployments, and secure CI/CD pipelines.',
          environmentUrl,
          isMendixCloud: true,
        } as CheckResult),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Not on Mendix Cloud - check for manual verification
    console.log('[A08] Application not on Mendix Cloud - checking manual verification');

    // Get OWASP item for A08 to get expiration months
    const { data: owaspItem, error: owaspError } = await supabase
      .from('owasp_items')
      .select('id, expiration_months')
      .eq('user_id', user_id)
      .eq('owasp_id', 'A08')
      .single();

    if (owaspError || !owaspItem) {
      console.log('[A08] Could not find OWASP A08 item:', owaspError?.message);
      return new Response(
        JSON.stringify({
          status: 'fail',
          details: 'Application is not hosted on Mendix Cloud. Manual verification of server security documentation is required. Please verify that your deployment environment has proper software integrity controls.',
          environmentUrl,
          isMendixCloud: false,
        } as CheckResult),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for existing manual verification
    const { data: verification, error: verifyError } = await supabase
      .from('owasp_manual_verifications')
      .select('verified_at, notes')
      .eq('app_id', app_id)
      .eq('user_id', user_id)
      .eq('owasp_item_id', owaspItem.id)
      .ilike('environment_name', 'production')
      .order('verified_at', { ascending: false })
      .limit(1)
      .single();

    if (verifyError || !verification) {
      console.log('[A08] No manual verification found');
      return new Response(
        JSON.stringify({
          status: 'fail',
          details: 'Application is not hosted on Mendix Cloud. Manual verification of server security documentation is required. Please verify that your deployment environment has:\n• Signed and verified deployment packages\n• Secure CI/CD pipeline\n• Integrity checks for dependencies\n• Proper access controls for deployment',
          environmentUrl,
          isMendixCloud: false,
        } as CheckResult),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if verification is expired
    const verifiedAt = new Date(verification.verified_at);
    const expirationMonths = owaspItem.expiration_months || 12;
    const expirationDate = new Date(verifiedAt);
    expirationDate.setMonth(expirationDate.getMonth() + expirationMonths);

    const now = new Date();
    const isExpired = now > expirationDate;

    if (isExpired) {
      console.log('[A08] Manual verification expired');
      return new Response(
        JSON.stringify({
          status: 'fail',
          details: `Manual verification expired on ${expirationDate.toISOString().split('T')[0]}. Please re-verify the server security documentation to confirm software integrity controls are still in place.`,
          environmentUrl,
          isMendixCloud: false,
          verificationDate: verification.verified_at,
          expirationDate: expirationDate.toISOString(),
        } as CheckResult),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verification is valid
    console.log('[A08] Manual verification valid until:', expirationDate.toISOString());
    return new Response(
      JSON.stringify({
        status: 'pass',
        details: `Server security documentation verified on ${verifiedAt.toISOString().split('T')[0]}. Verification valid until ${expirationDate.toISOString().split('T')[0]}.${verification.notes ? `\n\nNotes: ${verification.notes}` : ''}`,
        environmentUrl,
        isMendixCloud: false,
        verificationDate: verification.verified_at,
        expirationDate: expirationDate.toISOString(),
      } as CheckResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[A08] Error:', error);
    return new Response(
      JSON.stringify({
        status: 'error',
        details: `Error checking software integrity: ${getErrorMessage(error)}`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
