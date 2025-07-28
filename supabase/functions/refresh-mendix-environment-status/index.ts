import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    // Get the JWT from the Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Verify the JWT and get user
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    
    if (authError || !user) {
      throw new Error('Invalid token');
    }

    // Parse request body
    const { credentialId, appId, environmentId } = await req.json();

    if (!credentialId || !appId || !environmentId) {
      throw new Error('Missing required parameters: credentialId, appId, environmentId');
    }

    console.log(`Refreshing environment status for app: ${appId}, environment: ${environmentId}`);

    // Get credentials from the database (ensure they belong to the user)
    const { data: credential, error: credError } = await supabase
      .from('mendix_credentials')
      .select('*')
      .eq('id', credentialId)
      .eq('user_id', user.id)
      .single();

    if (credError || !credential) {
      throw new Error('Credentials not found or unauthorized');
    }

    // Get the project_id (UUID) from mendix_apps table - this is required for Mendix API v4
    const { data: appData, error: appError } = await supabase
      .from('mendix_apps')
      .select('project_id')
      .eq('app_id', appId)
      .eq('user_id', user.id)
      .single();

    if (appError || !appData || !appData.project_id) {
      throw new Error(`App not found or missing project_id for app: ${appId}`);
    }

    const projectId = appData.project_id;
    console.log(`Using project_id: ${projectId} for app: ${appId}`);

    // Prepare headers for Mendix API call
    const headers: Record<string, string> = {
      'Mendix-Username': credential.username,
    };

    if (credential.api_key) {
      headers['Mendix-ApiKey'] = credential.api_key;
    }

    if (credential.pat) {
      headers['Authorization'] = `MxToken ${credential.pat}`;
    }

    // Use V4 API exclusively for environment status retrieval with project_id (UUID)
    const mendixResponse = await fetch(`https://deploy.mendix.com/api/4/apps/${projectId}/environments/${environmentId}`, {
      method: 'GET',
      headers
    });

    if (!mendixResponse.ok) {
      throw new Error(`Failed to fetch environment status: ${mendixResponse.status}`);
    }

    const environmentData = await mendixResponse.json();
    console.log(`Successfully fetched environment status for ${environmentId}`);

    // Update the environment in the database with fresh data
    const { error: updateError } = await supabase
      .from('mendix_environments')
      .update({
        status: environmentData.Status || environmentData.status || 'unknown',
        model_version: environmentData.ModelVersion || environmentData.model_version,
        runtime_version: environmentData.RuntimeVersion || environmentData.runtime_version,
        url: environmentData.Url || environmentData.url,
        updated_at: new Date().toISOString()
      })
      .eq('environment_id', environmentId)
      .eq('app_id', appId)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Error updating environment in database:', updateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        environment: {
          id: environmentData.EnvironmentId || environmentData.environment_id || environmentId,
          name: environmentData.Name || environmentData.name,
          status: environmentData.Status || environmentData.status || 'unknown',
          model_version: environmentData.ModelVersion || environmentData.model_version,
          runtime_version: environmentData.RuntimeVersion || environmentData.runtime_version,
          url: environmentData.Url || environmentData.url
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error refreshing environment status:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});