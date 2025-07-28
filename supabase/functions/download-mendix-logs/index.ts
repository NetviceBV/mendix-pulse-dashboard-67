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

    const { credentialId, appName, environmentName, environmentId, date } = await req.json();

    if (!credentialId || !appName || (!environmentName && !environmentId)) {
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
    // Normalize app name and environment name for Mendix API
    const normalizedAppName = appName.toLowerCase().replace(/\s+/g, '-');
    const normalizedEnvName = (environmentId || environmentName).toLowerCase();
    
    console.log(`Original app name: "${appName}" -> normalized: "${normalizedAppName}"`);
    console.log(`Original environment: "${environmentId || environmentName}" -> normalized: "${normalizedEnvName}"`);
    
    // Generate today's date in YYYY-MM-DD format
    const today = new Date();
    const todayDate = today.getFullYear() + '-' + 
      String(today.getMonth() + 1).padStart(2, '0') + '-' + 
      String(today.getDate()).padStart(2, '0');
    
    // Use today's date in the URL path as required by Mendix API v1
    const logsUrl = `https://deploy.mendix.com/api/1/apps/${normalizedAppName}/environments/${normalizedEnvName}/logs/${todayDate}`;
    
    console.log(`Constructed logs URL: ${logsUrl}`);
    
    // Step 1: Get the download URL from Mendix API
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
      console.error(`Failed to get download URL: ${response.status} - ${errorText}`);
      console.error(`URL that failed: ${logsUrl}`);
      throw new Error(`Failed to get download URL: ${response.status} for URL: ${logsUrl}`);
    }

    // Parse the JSON response to get the DownloadUrl
    const downloadResponse = await response.json();
    console.log('Download response:', downloadResponse);
    
    if (!downloadResponse.DownloadUrl) {
      throw new Error('No DownloadUrl found in response');
    }

    console.log(`Downloading logs from: ${downloadResponse.DownloadUrl}`);
    
    // Step 2: Download the actual logs using the DownloadUrl
    const logsResponse = await fetch(downloadResponse.DownloadUrl, {
      method: 'GET',
      headers: {
        'Mendix-Username': credentials.username,
        'Mendix-ApiKey': credentials.api_key || credentials.pat || ''
      }
    });

    if (!logsResponse.ok) {
      const errorText = await logsResponse.text();
      console.error(`Failed to download logs from URL: ${logsResponse.status} - ${errorText}`);
      throw new Error(`Failed to download logs from URL: ${logsResponse.status}`);
    }

    // Get the actual log content
    const logText = await logsResponse.text();
    const result = { logs: logText };
    
    console.log(`Logs downloaded successfully for environment ${envIdentifier}`);

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