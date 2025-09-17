import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

interface MonitoringRequest {
  environment_id: string;
  user_id: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { environment_id, user_id }: MonitoringRequest = await req.json();

    console.log(`Monitoring logs for environment: ${environment_id}, user: ${user_id}`);

    // Get environment details and monitoring settings
    const { data: environment, error: envError } = await supabase
      .from('mendix_environments')
      .select(`
        *,
        log_monitoring_settings!inner(*)
      `)
      .eq('id', environment_id)
      .eq('user_id', user_id)
      .eq('log_monitoring_settings.is_enabled', true)
      .single();

    if (envError || !environment) {
      console.error('Environment not found or monitoring disabled:', envError);
      return new Response(
        JSON.stringify({ error: 'Environment not found or monitoring disabled' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's Mendix credentials
    const { data: credentials, error: credError } = await supabase
      .from('mendix_credentials')
      .select('*')
      .eq('user_id', user_id)
      .eq('id', environment.credential_id)
      .single();

    if (credError || !credentials) {
      console.error('Credentials not found:', credError);
      return new Response(
        JSON.stringify({ error: 'Mendix credentials not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Download latest logs using the existing download-mendix-logs function
    const today = new Date().toISOString().split('T')[0];
    
    const downloadResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/download-mendix-logs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        credentialId: credentials.id,
        appName: environment.app_id,
        environmentName: environment.environment_name,
        environmentId: environment.environment_id,
        date: today
      }),
    });

    if (!downloadResponse.ok) {
      console.error('Failed to download logs:', await downloadResponse.text());
      return new Response(
        JSON.stringify({ error: 'Failed to download logs' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const logData = await downloadResponse.json();
    
    if (!logData.logs) {
      console.log('No logs available for analysis');
      return new Response(
        JSON.stringify({ message: 'No logs available', alerts: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Analyze logs for errors and critical issues
    const logLines = logData.logs.split('\n').filter((line: string) => line.trim());
    const errorLines: string[] = [];
    const criticalLines: string[] = [];

    const errorRegex = /\b(ERROR|Error)\b/i;
    const criticalRegex = /\b(CRITICAL|Critical|FATAL|Fatal)\b/i;

    for (const line of logLines) {
      if (criticalRegex.test(line)) {
        criticalLines.push(line);
      } else if (errorRegex.test(line)) {
        errorLines.push(line);
      }
    }

    console.log(`Found ${errorLines.length} error lines, ${criticalLines.length} critical lines`);

    let alertsCreated = 0;

    // Create alerts if thresholds are met
    const monitoringSettings = environment.log_monitoring_settings[0];
    
    if (errorLines.length >= monitoringSettings.error_threshold) {
      const { error: alertError } = await supabase
        .from('log_monitoring_alerts')
        .insert({
          user_id: user_id,
          environment_id: environment_id,
          alert_type: 'error',
          log_entries_count: errorLines.length,
          log_content: errorLines.slice(0, 50).join('\n'), // Limit to first 50 lines
        });

      if (alertError) {
        console.error('Failed to create error alert:', alertError);
      } else {
        alertsCreated++;
        console.log('Created error alert');
      }
    }

    if (criticalLines.length >= monitoringSettings.critical_threshold) {
      const { error: alertError } = await supabase
        .from('log_monitoring_alerts')
        .insert({
          user_id: user_id,
          environment_id: environment_id,
          alert_type: 'critical',
          log_entries_count: criticalLines.length,
          log_content: criticalLines.slice(0, 50).join('\n'), // Limit to first 50 lines
        });

      if (alertError) {
        console.error('Failed to create critical alert:', alertError);
      } else {
        alertsCreated++;
        console.log('Created critical alert');
      }
    }

    // Update last check time
    await supabase
      .from('log_monitoring_settings')
      .update({ last_check_time: new Date().toISOString() })
      .eq('environment_id', environment_id)
      .eq('user_id', user_id);

    return new Response(
      JSON.stringify({
        message: 'Log monitoring completed',
        alerts: alertsCreated,
        errors_found: errorLines.length,
        critical_found: criticalLines.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in monitor-environment-logs:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};

serve(handler);