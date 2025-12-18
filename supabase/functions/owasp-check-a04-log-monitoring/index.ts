import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { app_id, environment_name, user_id } = await req.json();

    console.log(`[A04-Log-Monitoring] Starting check for app: ${app_id}, env: ${environment_name}, user: ${user_id}`);

    if (!app_id || !user_id) {
      return new Response(JSON.stringify({
        status: 'fail',
        details: 'Missing required parameters: app_id and user_id',
        execution_time_ms: Date.now() - startTime,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Step 1: Find the production environment for this app
    const { data: prodEnvironment, error: envError } = await supabase
      .from('mendix_environments')
      .select('id, environment_name')
      .eq('app_id', app_id)
      .eq('user_id', user_id)
      .ilike('environment_name', 'production')
      .maybeSingle();

    if (envError) {
      console.error(`[A04-Log-Monitoring] Error fetching environment:`, envError);
      return new Response(JSON.stringify({
        status: 'fail',
        details: `Database error: ${envError.message}`,
        execution_time_ms: Date.now() - startTime,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    if (!prodEnvironment) {
      console.log(`[A04-Log-Monitoring] No production environment found for app: ${app_id}`);
      return new Response(JSON.stringify({
        status: 'warning',
        details: 'No production environment found for this application. Log monitoring check is not applicable.',
        execution_time_ms: Date.now() - startTime,
        raw_response: { production_environment_found: false },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    console.log(`[A04-Log-Monitoring] Found production environment: ${prodEnvironment.id}`);

    // Step 2: Check if log monitoring is enabled for the production environment
    const { data: monitoringSetting, error: monitoringError } = await supabase
      .from('log_monitoring_settings')
      .select('is_enabled')
      .eq('environment_id', prodEnvironment.id)
      .eq('user_id', user_id)
      .maybeSingle();

    if (monitoringError) {
      console.error(`[A04-Log-Monitoring] Error fetching monitoring settings:`, monitoringError);
      return new Response(JSON.stringify({
        status: 'fail',
        details: `Database error: ${monitoringError.message}`,
        execution_time_ms: Date.now() - startTime,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    const logMonitoringEnabled = monitoringSetting?.is_enabled === true;

    // Step 3: Check if at least one active email has log monitoring enabled
    const { data: emailRecipients, error: emailError } = await supabase
      .from('notification_email_addresses')
      .select('email_address')
      .eq('user_id', user_id)
      .eq('is_active', true)
      .eq('log_monitoring_enabled', true);

    if (emailError) {
      console.error(`[A04-Log-Monitoring] Error fetching email settings:`, emailError);
      return new Response(JSON.stringify({
        status: 'fail',
        details: `Database error: ${emailError.message}`,
        execution_time_ms: Date.now() - startTime,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    const hasEmailRecipients = emailRecipients && emailRecipients.length > 0;

    // Build result based on conditions
    const rawResponse = {
      production_environment_found: true,
      production_environment_id: prodEnvironment.id,
      log_monitoring_enabled: logMonitoringEnabled,
      email_recipients_configured: hasEmailRecipients,
      email_recipients_count: emailRecipients?.length || 0,
    };

    let status: string;
    let details: string;

    if (logMonitoringEnabled && hasEmailRecipients) {
      status = 'pass';
      details = `Log monitoring is enabled for production environment and ${emailRecipients.length} email recipient(s) configured for alerts.`;
    } else if (!logMonitoringEnabled && !hasEmailRecipients) {
      status = 'fail';
      details = 'Log monitoring is NOT enabled for production environment AND no email recipients are configured for log monitoring alerts. Enable log monitoring in Settings → Log Monitoring and configure email recipients in Settings → Email Management.';
    } else if (!logMonitoringEnabled) {
      status = 'fail';
      details = 'Log monitoring is NOT enabled for production environment. Enable it in Settings → Log Monitoring.';
    } else {
      status = 'fail';
      details = 'No email recipients are configured for log monitoring alerts. Add and enable email recipients in Settings → Email Management with "Log Monitoring" toggle enabled.';
    }

    console.log(`[A04-Log-Monitoring] Check completed - Status: ${status}, Details: ${details}`);

    return new Response(JSON.stringify({
      status,
      details,
      execution_time_ms: Date.now() - startTime,
      raw_response: rawResponse,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error(`[A04-Log-Monitoring] Unexpected error:`, error);
    return new Response(JSON.stringify({
      status: 'fail',
      details: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      execution_time_ms: Date.now() - startTime,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
