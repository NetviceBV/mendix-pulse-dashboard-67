import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT and get user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    
    if (authError || !user) {
      throw new Error('Invalid authentication');
    }

    const { credentialId, appName, environmentName, date } = await req.json();

    if (!credentialId || !appName || !environmentName) {
      throw new Error('Missing required parameters');
    }

    // Get user's credentials
    const { data: credentials, error: credError } = await supabase
      .from('mendix_credentials')
      .select('*')
      .eq('id', credentialId)
      .eq('user_id', user.id)
      .single();

    if (credError || !credentials) {
      throw new Error('Credentials not found or access denied');
    }

    // Download logs using Mendix Deploy API v1
    let logsUrl = `https://deploy.mendix.com/api/1/apps/${appName}/environments/${environmentName}/logs`;
    
    // Add date parameter if provided
    if (date) {
      logsUrl += `?date=${encodeURIComponent(date)}`;
    }
    
    console.log(`Downloading logs for environment ${environmentName} for app ${appName}${date ? ` on ${date}` : ''}`);
    
    const response = await fetch(logsUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Mendix-Username': credentials.username,
        'Mendix-ApiKey': credentials.api_key || credentials.pat || ''
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to download logs: ${response.status} - ${errorText}`);
      throw new Error(`Failed to download logs: ${response.status}`);
    }

    // Check if response is JSON or plain text
    const contentType = response.headers.get('content-type');
    let result;
    
    if (contentType && contentType.includes('application/json')) {
      result = await response.json();
    } else {
      // Logs are likely plain text
      const logText = await response.text();
      result = { logs: logText };
    }
    
    console.log(`Logs downloaded successfully for environment ${environmentName}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Logs downloaded successfully',
        data: result,
        date: date || 'latest'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error downloading logs:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to download logs',
        success: false 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 500 
      }
    );
  }
});