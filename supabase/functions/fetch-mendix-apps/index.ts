import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      console.error('No authorization header');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify JWT and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { credentialId } = await req.json();
    if (!credentialId) {
      return new Response(JSON.stringify({ error: 'Credential ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch the credential details - ensure it belongs to the authenticated user
    const { data: credential, error: credentialError } = await supabase
      .from('mendix_credentials')
      .select('*')
      .eq('id', credentialId)
      .eq('user_id', user.id)
      .single();

    if (credentialError || !credential) {
      console.error('Credential fetch error:', credentialError);
      return new Response(JSON.stringify({ error: 'Credential not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Making API call for credential: ${credential.username}`);

    // Make the API call to Mendix using both API key and PAT if available
    const headers: Record<string, string> = {
      'Mendix-Username': credential.username,
    };

    if (credential.api_key) {
      headers['Mendix-ApiKey'] = credential.api_key;
    }

    if (credential.pat) {
      headers['Authorization'] = `MxToken ${credential.pat}`;
    }

    // Try v4 API first, fall back to v1 if needed
    let mendixResponse = await fetch('https://deploy.mendix.com/api/4/apps', {
      method: 'GET',
      headers
    });

    // If v4 fails, try v1 API
    if (!mendixResponse.ok) {
      console.log(`V4 API failed with ${mendixResponse.status}, trying V1 API`);
      mendixResponse = await fetch('https://deploy.mendix.com/api/1/apps', {
        method: 'GET',
        headers
      });
    }

    if (!mendixResponse.ok) {
      console.error(`Mendix API error: ${mendixResponse.status} ${mendixResponse.statusText}`);
      return new Response(JSON.stringify({
        error: `Mendix API error: ${mendixResponse.status} ${mendixResponse.statusText}`
      }), {
        status: mendixResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const apps = await mendixResponse.json();
    console.log(`Successfully fetched ${apps.length} apps from Mendix`);

    // Clear previous results for this credential
    const { error: deleteAppsError } = await supabase
      .from('mendix_apps')
      .delete()
      .eq('credential_id', credentialId)
      .eq('user_id', user.id);

    if (deleteAppsError) {
      console.error('Error deleting previous app results:', deleteAppsError);
    }

    const { error: deleteEnvsError } = await supabase
      .from('mendix_environments')
      .delete()
      .eq('credential_id', credentialId)
      .eq('user_id', user.id);

    if (deleteEnvsError) {
      console.error('Error deleting previous environment results:', deleteEnvsError);
    }

    // Store the new app results and fetch environments
    if (apps.length > 0) {
      // Process each app individually to get real deployment data
      const appResults = [];
      
      for (const app of apps) {
        // Get deployment info from API if available
        let deploymentInfo = null;
        try {
          const deployUrl = `https://deploy.mendix.com/api/1/apps/${app.AppId}/packages`;
          const deployResponse = await fetch(deployUrl, {
            headers: {
              'Accept': 'application/json',
              'Mendix-Username': credential.username,
              'Mendix-ApiKey': credential.api_key || credential.pat || ''
            }
          });
          
          if (deployResponse.ok) {
            const packages = await deployResponse.json();
            if (packages && packages.length > 0) {
              const latestPackage = packages[0];
              deploymentInfo = {
                version: latestPackage.Version || '1.0.0',
                created: latestPackage.Created
              };
            }
          }
        } catch (deployError) {
          console.log(`Could not fetch deployment info for ${app.Name}:`, deployError.message);
        }

        appResults.push({
          user_id: user.id,
          credential_id: credentialId,
          app_name: app.Name,
          app_url: app.Url,
          project_id: app.ProjectId,
          app_id: app.AppId,
          status: 'healthy', // Will be determined from environments
          environment: 'production', // Will be determined from environments
          version: deploymentInfo?.version || '1.0.0',
          active_users: 0, // Real monitoring data not available yet
          error_count: 0, // Real monitoring data not available yet
          last_deployed: deploymentInfo?.created || null
        });
      }

      const { error: insertError } = await supabase
        .from('mendix_apps')
        .insert(appResults);

      if (insertError) {
        console.error('Error storing app results:', insertError);
        return new Response(JSON.stringify({ error: 'Failed to store app results' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Fetch environments for each app
      console.log('Fetching environments for apps...');
      const environmentResults = [];

      for (const app of apps) {
        try {
          // Try v4 API first for environments
          let envResponse = await fetch(`https://deploy.mendix.com/api/4/apps/${app.AppId}/environments`, {
            method: 'GET',
            headers
          });

          // If v4 fails, try v1 API for environments
          if (!envResponse.ok) {
            console.log(`V4 environments API failed for app ${app.Name}, trying V1`);
            envResponse = await fetch(`https://deploy.mendix.com/api/1/apps/${app.AppId}/environments`, {
              method: 'GET',
              headers
            });
          }

          if (envResponse.ok) {
            const environments = await envResponse.json();
            console.log(`Found ${environments.length} environments for app ${app.Name}`);
            console.log('Environment structure sample:', JSON.stringify(environments[0], null, 2));
            
            for (const env of environments) {
              // Try multiple field names for environment name (v4 vs v1 API differences)
              let envName = env.name || env.environmentName || env.Name || env.Mode || env.Type || env.mode;
              
              // If no environment name found, use intelligent fallback
              if (!envName) {
                if (env.Production === true) {
                  envName = 'production';
                } else if (env.url && env.url.includes('sandbox')) {
                  envName = 'sandbox';
                } else if (env.url && env.url.includes('accp')) {
                  envName = 'acceptance';
                } else if (env.url && env.url.includes('test')) {
                  envName = 'test';
                } else {
                  envName = 'unknown';
                }
              }
              
              // Convert to lowercase and normalize
              envName = envName.toLowerCase().trim();
              
              environmentResults.push({
                user_id: user.id,
                credential_id: credentialId,
                app_id: app.AppId,
                environment_id: env.environmentId || env.EnvironmentId || env.id || env.Id,
                environment_name: envName,
                status: (env.status || env.Status || 'unknown').toLowerCase(),
                url: env.url || env.Url,
                model_version: env.modelVersion || env.ModelVersion,
                runtime_version: env.runtimeVersion || env.RuntimeVersion
              });
            }
          } else {
            console.log(`No environments found for app ${app.Name}: ${envResponse.status}`);
          }
        } catch (envError) {
          console.error(`Error fetching environments for app ${app.Name}:`, envError);
        }
      }

      // Store environment results
      if (environmentResults.length > 0) {
        const { error: envInsertError } = await supabase
          .from('mendix_environments')
          .insert(environmentResults);

        if (envInsertError) {
          console.error('Error storing environment results:', envInsertError);
        } else {
          console.log(`Successfully stored ${environmentResults.length} environments`);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      apps,
      message: `Successfully fetched and stored ${apps.length} apps`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in fetch-mendix-apps function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});