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

    const { credentialId, appId, environmentId, environmentName } = await req.json();

    if (!credentialId || !appId || !environmentId) {
      throw new Error('Missing required parameters');
    }

    // Check if environment is production (block production stops for safety)
    if (environmentName && environmentName.toLowerCase() === 'production') {
      return new Response(
        JSON.stringify({ 
          error: 'Stopping production environments is not allowed for safety reasons',
          success: false 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
          status: 403 
        }
      );
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
    const stopUrl = `https://deploy.mendix.com/api/1/apps/${appId}/environments/${environmentId}/stop`;
    
    console.log(`Stopping environment ${environmentId} for app ${appId}`);
    
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

    const result = await response.json();
    console.log(`Environment ${environmentId} stop initiated successfully`);

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
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to stop environment',
        success: false 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 500 
      }
    );
  }
});