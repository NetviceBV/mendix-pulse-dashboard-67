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

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Processing log monitoring for all users...');

    // Find all monitoring settings that are due for checking
    const { data: dueSettings, error: settingsError } = await supabase
      .from('log_monitoring_settings')
      .select('*')
      .eq('is_enabled', true)
      .lt('last_check_time', new Date(Date.now() - 30 * 60 * 1000).toISOString()); // 30 minutes ago

    if (settingsError) {
      console.error('Error fetching monitoring settings:', settingsError);
      throw settingsError;
    }

    console.log(`Found ${dueSettings?.length || 0} environments due for monitoring`);

    if (!dueSettings || dueSettings.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No environments due for monitoring', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    // Process each environment
    for (const setting of dueSettings) {
      try {
        console.log(`Processing environment ${setting.environment_id} for user ${setting.user_id}`);
        
        // Check if it's actually time to process this setting based on its interval
        const timeSinceLastCheck = Date.now() - new Date(setting.last_check_time).getTime();
        const intervalMs = setting.check_interval_minutes * 60 * 1000;
        
        if (timeSinceLastCheck < intervalMs) {
          console.log(`Skipping ${setting.environment_id} - not time yet (${Math.round(timeSinceLastCheck / 60000)} < ${setting.check_interval_minutes} minutes)`);
          continue;
        }

        const monitorResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/monitor-environment-logs`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            environment_id: setting.environment_id,
            user_id: setting.user_id,
          }),
        });

        if (monitorResponse.ok) {
          const result = await monitorResponse.json();
          console.log(`Successfully processed ${setting.environment_id}: ${result.alerts} alerts created`);
          succeeded++;
        } else {
          const errorText = await monitorResponse.text();
          console.error(`Failed to process ${setting.environment_id}:`, errorText);
          failed++;
        }

        processed++;

      } catch (error: any) {
        console.error(`Error processing setting ${setting.id}:`, error);
        failed++;
        processed++;
      }
    }

    console.log(`Background processing completed: ${processed} processed, ${succeeded} succeeded, ${failed} failed`);

    return new Response(
      JSON.stringify({
        message: 'Log monitoring processing completed',
        processed,
        succeeded,
        failed,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in process-log-monitoring:', error);
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