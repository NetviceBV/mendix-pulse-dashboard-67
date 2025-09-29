import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

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

    // Check if this is an internal system call (from monitoring or cloud actions)
    const cronSignature = req.headers.get('x-cron-signature');
    const isInternalCall = cronSignature === 'log-monitoring-internal-call' || cronSignature === 'cloud-action-internal-call';
    
    let userId: string;
    let requestBody: any;
    
    if (isInternalCall) {
      // For internal calls, get user_id from request body
      requestBody = await req.json();
      userId = requestBody.user_id;
      
      if (!userId) {
        throw new Error('Missing user_id parameter for internal call');
      }
      
      console.log(`Internal call detected for user: ${userId}`);
    } else {
      // For user calls, verify JWT and get user
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        throw new Error('No authorization header');
      }

      const jwt = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
      
      if (authError || !user) {
        throw new Error('Invalid authentication');
      }
      
      userId = user.id;
      requestBody = await req.json();
    }

    const { credentialId, appName, environmentName, environmentId, date } = requestBody;

    if (!credentialId || !appName || (!environmentName && !environmentId)) {
      throw new Error('Missing required parameters');
    }

    // Get user's credentials
    const { data: credentials, error: credError } = await supabase
      .from('mendix_credentials')
      .select('*')
      .eq('id', credentialId)
      .eq('user_id', userId)
      .single();

    if (credError || !credentials) {
      throw new Error('Credentials not found or access denied');
    }

    // Get the actual environment name if environmentId is provided
    let actualEnvironmentName = environmentName;
    
    if (environmentId && !environmentName) {
      console.log(`Looking up environment name for ID: ${environmentId}`);
      const { data: envData, error: envError } = await supabase
        .from('mendix_environments')
        .select('environment_name')
        .eq('environment_id', environmentId)
        .eq('user_id', userId)
        .single();
      
      if (envError || !envData) {
        console.error(`Failed to find environment for ID ${environmentId}:`, envError);
        throw new Error(`Environment not found for ID: ${environmentId}`);
      }
      
      actualEnvironmentName = envData.environment_name;
      console.log(`Found environment name: ${actualEnvironmentName} for ID: ${environmentId}`);
    }

    // Environment name normalization function for Mendix API v1 (requires lowercase)
    const normalizeEnvironmentName = (envName: string): string => {
      const lowerName = envName.toLowerCase();
      // Explicit mapping for common environment names to lowercase
      switch (lowerName) {
        case 'production':
          return 'production';
        case 'acceptance':
          return 'acceptance';
        case 'test':
          return 'test';
        default:
          // Fallback: convert to lowercase
          return lowerName;
      }
    };

    // Normalize app name for Mendix API v1 (convert to slug format)
    const normalizedAppName = appName.toLowerCase()
      .replace(/\s+/g, '-')           // Replace spaces with hyphens
      .replace(/[^a-z0-9-]/g, '')     // Remove special characters except hyphens
      .replace(/-+/g, '-')            // Replace multiple hyphens with single
      .replace(/^-|-$/g, '');         // Remove leading/trailing hyphens
    
    // Normalize environment name for Mendix API v1 (proper case)
    const normalizedEnvironmentName = normalizeEnvironmentName(actualEnvironmentName);
    
    console.log(`Original app name: "${appName}" -> normalized slug: "${normalizedAppName}"`);
    console.log(`Original environment name: "${actualEnvironmentName}" -> normalized to lowercase: "${normalizedEnvironmentName}"`);
    
    if (!actualEnvironmentName) {
      throw new Error('Environment name is required but not found');
    }
    
    // Use provided date or generate today's date in YYYY-MM-DD format
    let selectedDate = date;
    if (!selectedDate) {
      const today = new Date();
      selectedDate = today.getFullYear() + '-' + 
        String(today.getMonth() + 1).padStart(2, '0') + '-' + 
        String(today.getDate()).padStart(2, '0');
    }
    
    console.log(`Using date: ${selectedDate} for logs download`);
    
    // Use selected date in the URL path as required by Mendix API v1
    // IMPORTANT: v1 API requires app slug and NORMALIZED environment NAME
    const logsUrl = `https://deploy.mendix.com/api/1/apps/${normalizedAppName}/environments/${normalizedEnvironmentName}/logs/${selectedDate}`;
    
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
    
    // Extract and log expire parameter for debugging
    try {
      const urlObj = new URL(downloadResponse.DownloadUrl);
      const expireParam = urlObj.searchParams.get('expire');
      if (expireParam) {
        console.log(`DownloadUrl expires at: ${expireParam}, current time: ${new Date().toISOString()}`);
      }
    } catch (e) {
      console.log('Could not parse DownloadUrl for expire parameter');
    }
    
    // Step 2: Download the actual logs using the DownloadUrl (pre-signed, no auth headers needed)
    let logsResponse = await fetch(downloadResponse.DownloadUrl, {
      method: 'GET',
      redirect: 'follow'
    });

    // If we get 403 Invalid signature, retry once with fresh DownloadUrl
    if (!logsResponse.ok && logsResponse.status === 403) {
      console.log('Got 403 on first attempt, retrying with fresh DownloadUrl...');
      
      // Get fresh DownloadUrl
      const retryResponse = await fetch(logsUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Mendix-Username': credentials.username,
          'Mendix-ApiKey': credentials.api_key || credentials.pat || ''
        }
      });
      
      if (retryResponse.ok) {
        const retryDownloadResponse = await retryResponse.json();
        if (retryDownloadResponse.DownloadUrl) {
          console.log(`Retrying with fresh DownloadUrl: ${retryDownloadResponse.DownloadUrl}`);
          logsResponse = await fetch(retryDownloadResponse.DownloadUrl, {
            method: 'GET',
            redirect: 'follow'
          });
        }
      }
    }

    if (!logsResponse.ok) {
      const errorText = await logsResponse.text();
      console.error(`Failed to download logs from URL: ${logsResponse.status} - ${errorText}`);
      throw new Error(`Failed to download logs from URL: ${logsResponse.status}`);
    }

    // Get the actual log content
    const logText = await logsResponse.text();
    const result = { logs: logText };
    
    console.log(`Logs downloaded successfully for environment ${actualEnvironmentName}`);

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