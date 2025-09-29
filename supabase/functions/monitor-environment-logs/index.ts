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

    // Fixed: Using project_id mapping for app lookup

    // Get environment details and monitoring settings (step 1)
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

    // Get mendix_apps record using the environment's app_id (step 2)
    const { data: mendixApp, error: appError } = await supabase
      .from('mendix_apps')
      .select('app_id, app_name')
      .eq('project_id', environment.app_id)
      .eq('user_id', user_id)
      .single();

    if (appError || !mendixApp) {
      console.error('Mendix app not found:', appError);
      return new Response(
        JSON.stringify({ error: 'Mendix app not found' }),
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
        'x-cron-signature': 'log-monitoring-internal-call',
      },
      body: JSON.stringify({
        user_id: user_id,
        credentialId: credentials.id,
        appName: mendixApp.app_id,
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
    
    if (!logData.data || !logData.data.logs) {
      console.log('No logs available for analysis');
      return new Response(
        JSON.stringify({ message: 'No logs available', alerts: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get last check time from monitoring settings
    const monitoringSettings = environment.log_monitoring_settings[0];
    const lastCheckTime = monitoringSettings.last_check_time ? new Date(monitoringSettings.last_check_time) : null;
    const whitelistPatterns = monitoringSettings.whitelist_patterns || [];
    
    console.log(`Last check time: ${lastCheckTime?.toISOString() || 'Never checked before'}`);

    // Analyze logs for errors and critical issues - only new entries since last check
    const logLines = logData.data.logs.split('\n').filter((line: string) => line.trim());
    const newErrorLines: string[] = [];
    const newCriticalLines: string[] = [];
    let totalLines = 0;
    let filteredLines = 0;
    let whitelistedLines = 0;

    const errorRegex = /\b(ERROR|Error)\b/i;
    const criticalRegex = /\b(CRITICAL|Critical|FATAL|Fatal)\b/i;
    
    // UTC timestamp regex for Mendix logs: 2025-09-23T12:29:36.261309
    const timestampRegex = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+)/;

    for (const line of logLines) {
      totalLines++;
      
      // Extract timestamp from log line
      const timestampMatch = line.match(timestampRegex);
      if (timestampMatch) {
        const logTimestamp = new Date(timestampMatch[1] + 'Z'); // Add Z to ensure UTC parsing
        
        // Only process lines newer than last check time
        if (!lastCheckTime || logTimestamp > lastCheckTime) {
          filteredLines++;
          
          // Check if line matches any whitelist pattern (case-insensitive)
          const isWhitelisted = whitelistPatterns.some((pattern: string) => 
            line.toLowerCase().includes(pattern.toLowerCase())
          );
          
          if (isWhitelisted) {
            whitelistedLines++;
          } else {
            if (criticalRegex.test(line)) {
              newCriticalLines.push(line);
            } else if (errorRegex.test(line)) {
              newErrorLines.push(line);
            }
          }
        }
      } else {
        // If we can't parse timestamp, include the line (fallback for safety)
        filteredLines++;
        
        // Check if line matches any whitelist pattern (case-insensitive)
        const isWhitelisted = whitelistPatterns.some((pattern: string) => 
          line.toLowerCase().includes(pattern.toLowerCase())
        );
        
        if (isWhitelisted) {
          whitelistedLines++;
        } else {
          if (criticalRegex.test(line)) {
            newCriticalLines.push(line);
          } else if (errorRegex.test(line)) {
            newErrorLines.push(line);
          }
        }
      }
    }

    console.log(`Processed ${totalLines} total log lines, ${filteredLines} new lines since last check`);
    console.log(`Applied ${whitelistPatterns.length} whitelist patterns, ${whitelistedLines} lines filtered out`);
    console.log(`Found ${newErrorLines.length} new error lines, ${newCriticalLines.length} new critical lines`);

    let alertsCreated = 0;

    // Create alerts if thresholds are met - using only new log entries
    if (newErrorLines.length >= monitoringSettings.error_threshold) {
      const { error: alertError } = await supabase
        .from('log_monitoring_alerts')
        .insert({
          user_id: user_id,
          environment_id: environment_id,
          alert_type: 'error',
          log_entries_count: newErrorLines.length,
          log_content: newErrorLines.slice(0, 50).join('\n'), // Limit to first 50 lines
        });

      if (alertError) {
        console.error('Failed to create error alert:', alertError);
      } else {
        alertsCreated++;
        console.log('Created error alert for new entries');
        
        // Send email notification if enabled
        await sendLogAlertEmail(supabase, user_id, environment, 'error', newErrorLines.length, newCriticalLines.length, newErrorLines.slice(0, 10).join('\n'));
      }
    }

    if (newCriticalLines.length >= monitoringSettings.critical_threshold) {
      const { error: alertError } = await supabase
        .from('log_monitoring_alerts')
        .insert({
          user_id: user_id,
          environment_id: environment_id,
          alert_type: 'critical',
          log_entries_count: newCriticalLines.length,
          log_content: newCriticalLines.slice(0, 50).join('\n'), // Limit to first 50 lines
        });

      if (alertError) {
        console.error('Failed to create critical alert:', alertError);
      } else {
        alertsCreated++;
        console.log('Created critical alert for new entries');
        
        // Send email notification if enabled
        await sendLogAlertEmail(supabase, user_id, environment, 'critical', newErrorLines.length, newCriticalLines.length, newCriticalLines.slice(0, 10).join('\n'));
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
        errors_found: newErrorLines.length,
        critical_found: newCriticalLines.length,
        total_log_lines: totalLines,
        new_log_lines_analyzed: filteredLines,
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

// Helper function to send log alert emails
async function sendLogAlertEmail(supabase: any, user_id: string, environment: any, alert_type: string, error_count: number, critical_count: number, log_content: string) {
  try {
    // Get active email addresses for log monitoring
    const { data: emailAddresses, error } = await supabase
      .from('notification_email_addresses')
      .select('email_address, display_name')
      .eq('user_id', user_id)
      .eq('is_active', true)
      .eq('log_monitoring_enabled', true);

    if (error || !emailAddresses || emailAddresses.length === 0) {
      console.log('No active email addresses found for log monitoring notifications');
      return;
    }

    // Get app name from mendix_apps table using environment's app_id
    const { data: appData, error: appError } = await supabase
      .from('mendix_apps')
      .select('app_name')
      .eq('project_id', environment.app_id)
      .eq('user_id', user_id)
      .single();

    const appName = appData?.app_name || environment.app_id;

    // Get log alert template
    const { data: template, error: templateError } = await supabase
      .from('email_templates')
      .select('*')
      .eq('user_id', user_id)
      .eq('template_type', 'log_alert')
      .single();

    if (templateError || !template) {
      console.error('Log alert email template not found:', templateError);
      return;
    }

    // Prepare email recipients
    const recipients = emailAddresses.map((addr: any) => ({
      email: addr.email_address,
      name: addr.display_name || addr.email_address
    }));

    // Helper function to format dates in Dutch format
    const formatDutchDateTime = (date: Date): string => {
      return new Intl.DateTimeFormat('nl-NL', {
        timeZone: 'Europe/Amsterdam',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).format(date);
    };

    // Template variables
    const templateVariables = {
      app_name: appName,
      environment_name: environment.environment_name,
      error_count: error_count.toString(),
      critical_count: critical_count.toString(),
      timestamp: formatDutchDateTime(new Date()),
      log_content: log_content
    };

    // Send email
    const { error: emailError } = await supabase.functions.invoke('send-email-mandrill', {
      body: {
        to: recipients,
        subject: template.subject_template,
        html: template.html_template,
        template_variables: templateVariables,
      },
    });

    if (emailError) {
      console.error('Failed to send log alert email:', emailError);
    } else {
      console.log(`Log alert email sent to ${recipients.length} recipients`);
    }
  } catch (error) {
    console.error('Error sending log alert email:', error);
  }
}

serve(handler);