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

    const { credentialId, appName, environmentName } = await req.json();

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

    // Stop environment using Mendix Deploy API v1
    const stopUrl = `https://deploy.mendix.com/api/1/apps/${appName}/environments/${environmentName}/stop`;
    
    console.log(`Stopping environment ${environmentName} for app ${appName}`);
    
    const response = await fetch(stopUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Mendix-Username': credentials.username,
        'Mendix-ApiKey': credentials.api_key || credentials.pat || '',
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to stop environment: ${response.status} - ${errorText}`);
      throw new Error(`Failed to stop environment: ${response.status}`);
    }

    // Handle response - Mendix API may return empty body or non-JSON response
    let result = null;
    const contentType = response.headers.get('content-type');
    console.log(`Response status: ${response.status}, Content-Type: ${contentType}`);
    
    if (contentType && contentType.includes('application/json')) {
      const responseText = await response.text();
      if (responseText.trim()) {
        try {
          result = JSON.parse(responseText);
        } catch (parseError) {
          console.log(`Could not parse JSON response: ${responseText}`);
          result = { message: 'Environment stop initiated' };
        }
      } else {
        result = { message: 'Environment stop initiated' };
      }
    } else {
      result = { message: 'Environment stop initiated' };
    }
    
    console.log(`Environment ${environmentName} stop initiated successfully`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Environment stop initiated successfully',
        data: result 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error stopping environment:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to stop environment';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        success: false 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 500 
      }
    );
  }
});