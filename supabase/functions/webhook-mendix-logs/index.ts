import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validate API key
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Missing API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if API key exists and is active
    const { data: apiKeyData, error: apiKeyError } = await supabase
      .from('webhook_api_keys')
      .select('user_id, is_active')
      .eq('api_key', apiKey)
      .eq('is_active', true)
      .single();

    if (apiKeyError || !apiKeyData) {
      console.log('Invalid API key:', apiKey);
      return new Response(
        JSON.stringify({ error: 'Invalid or inactive API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = apiKeyData.user_id;
    console.log(`Processing webhook for user: ${userId}`);

    // Parse request body
    const body = await req.json();
    console.log('Received webhook payload:', JSON.stringify(body, null, 2));

    // Validate required fields
    const { appId, environment, timestamp, level, node, message, stacktrace } = body;

    if (!appId || !environment || !timestamp || !level || !message) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required fields: appId, environment, timestamp, level, message' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate log level
    const validLevels = ['Debug', 'Info', 'Warning', 'Error', 'Critical'];
    if (!validLevels.includes(level)) {
      return new Response(
        JSON.stringify({ 
          error: `Invalid log level. Must be one of: ${validLevels.join(', ')}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate environment
    const validEnvironments = ['Production', 'Acceptance', 'Test'];
    if (!validEnvironments.includes(environment)) {
      return new Response(
        JSON.stringify({ 
          error: `Invalid environment. Must be one of: ${validEnvironments.join(', ')}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert log entry
    const { data: logEntry, error: insertError } = await supabase
      .from('mendix_logs')
      .insert({
        user_id: userId,
        app_id: appId,
        environment: environment,
        timestamp: timestamp,
        level: level,
        node: node || null,
        message: message,
        stacktrace: stacktrace || null
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting log entry:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to store log entry' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Log entry stored successfully:', logEntry.id);

    // Update aggregated counts for warnings, errors, and critical logs
    if (['Warning', 'Error', 'Critical'].includes(level)) {
      
      // Update mendix_apps warning_count for warnings
      if (level === 'Warning') {
        const { error: appUpdateError } = await supabase.rpc(
          'increment_app_warning_count',
          { 
            target_app_id: appId,
            target_user_id: userId 
          }
        );
        
        if (appUpdateError) {
          console.error('Error updating app warning count:', appUpdateError);
        }
      }

      // Update mendix_apps error_count for errors and critical
      if (['Error', 'Critical'].includes(level)) {
        const { error: appUpdateError } = await supabase.rpc(
          'increment_app_error_count',
          { 
            target_app_id: appId,
            target_user_id: userId 
          }
        );
        
        if (appUpdateError) {
          console.error('Error updating app error count:', appUpdateError);
        }
      }

      // Update environment counts
      const { error: envUpdateError } = await supabase.rpc(
        'increment_environment_counts',
        {
          target_app_id: appId,
          target_environment: environment,
          target_level: level,
          target_user_id: userId
        }
      );

      if (envUpdateError) {
        console.error('Error updating environment counts:', envUpdateError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        logId: logEntry.id,
        message: 'Log entry processed successfully'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Webhook processing error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});