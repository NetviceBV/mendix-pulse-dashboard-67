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

    // Make the API call to Mendix using PAT authentication only
    const headers: Record<string, string> = {};

    if (credential.pat) {
      headers['Authorization'] = `MxToken ${credential.pat}`;
    }

    // Use V4 API exclusively for data retrieval
    const mendixResponse = await fetch('https://cloud.home.mendix.com/api/v4/apps', {
      method: 'GET',
      headers
    });

    if (!mendixResponse.ok) {
      console.error(`Mendix API error: ${mendixResponse.status} ${mendixResponse.statusText}`);
      return new Response(JSON.stringify({
        error: `Mendix API error: ${mendixResponse.status} ${mendixResponse.statusText}`
      }), {
        status: mendixResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const response = await mendixResponse.json();
    console.log('Full Mendix API response:', JSON.stringify(response, null, 2));
    
    // Parse apps from the response structure
    const apps = response.apps || response || [];
    console.log(`Successfully fetched ${apps.length} apps from Mendix`);
    
    if (!apps || apps.length === 0) {
      console.log('No apps found in response. Response structure:', Object.keys(response));
    }

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
          const deployUrl = `https://deploy.mendix.com/api/1/apps/${app.id}/packages`;
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
          console.log(`Could not fetch deployment info for ${app.name}:`, deployError.message);
        }

        appResults.push({
          user_id: user.id,
          credential_id: credentialId,
          app_name: app.name,
          app_url: `https://${app.subdomain}.mendixcloud.com`,
          project_id: app.id,
          app_id: app.id,
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
          // Step 1: Get list of environments for the app
          const envListResponse = await fetch(`https://cloud.home.mendix.com/api/v4/apps/${app.id}/environments`, {
            method: 'GET',
            headers
          });

          if (envListResponse.ok) {
            const envListData = await envListResponse.json();
            console.log(`Environment list for app ${app.name}:`, JSON.stringify(envListData, null, 2));
            
            // Extract environments array from response
            const environments = envListData.Environments || envListData.environments || [];
            console.log(`Found ${environments.length} environments for app ${app.name}`);
            
            // Step 2: Get detailed info for each environment
            for (const env of environments) {
              try {
                const envDetailResponse = await fetch(`https://cloud.home.mendix.com/api/v4/apps/${app.id}/environments/${env.id}`, {
                  method: 'GET',
                  headers
                });

                if (envDetailResponse.ok) {
                  const envDetail = await envDetailResponse.json();
                  console.log(`Environment detail for ${env.name}:`, JSON.stringify(envDetail, null, 2));
                  
                  environmentResults.push({
                    user_id: user.id,
                    credential_id: credentialId,
                    app_id: app.id,
                    environment_id: envDetail.id || env.id,
                    environment_name: (envDetail.name || env.name).toLowerCase().trim(),
                    status: (envDetail.state || envDetail.status || 'unknown').toLowerCase(),
                    url: envDetail.url || env.url,
                    model_version: envDetail.modelVersion,
                    runtime_version: envDetail.runtimeVersion
                  });
                } else {
                  console.log(`Failed to get detail for environment ${env.id}: ${envDetailResponse.status}`);
                  // Fallback to basic environment info from list
                  environmentResults.push({
                    user_id: user.id,
                    credential_id: credentialId,
                    app_id: app.id,
                    environment_id: env.id,
                    environment_name: (env.name).toLowerCase().trim(),
                    status: (env.state || env.status || 'unknown').toLowerCase(),
                    url: env.url,
                    model_version: null,
                    runtime_version: null
                  });
                }
              } catch (envDetailError) {
                console.error(`Error fetching detail for environment ${env.id}:`, envDetailError);
                // Fallback to basic environment info
                environmentResults.push({
                  user_id: user.id,
                  credential_id: credentialId,
                  app_id: app.id,
                  environment_id: env.id,
                  environment_name: (env.name).toLowerCase().trim(),
                  status: (env.state || env.status || 'unknown').toLowerCase(),
                  url: env.url,
                  model_version: null,
                  runtime_version: null
                });
              }
            }
          } else {
            console.log(`No environments found for app ${app.name}: ${envListResponse.status}`);
          }
        } catch (envError) {
          console.error(`Error fetching environments for app ${app.name}:`, envError);
        }
      }

      // Store environment results with detailed logging and validation
      if (environmentResults.length > 0) {
        console.log(`Attempting to store ${environmentResults.length} environments`);
        console.log('Environment data being inserted:', JSON.stringify(environmentResults, null, 2));
        
        // Validate each environment record before insertion
        const validatedResults = environmentResults.map((env, index) => {
          console.log(`Validating environment ${index + 1}:`, {
            user_id: env.user_id,
            credential_id: env.credential_id,
            app_id: env.app_id,
            environment_name: env.environment_name,
            has_user_id: !!env.user_id,
            has_credential_id: !!env.credential_id,
            has_app_id: !!env.app_id,
            has_environment_name: !!env.environment_name
          });
          
          // Ensure required fields are present and properly formatted
          return {
            user_id: env.user_id,
            credential_id: env.credential_id,
            app_id: env.app_id,
            environment_id: env.environment_id || null,
            environment_name: env.environment_name,
            status: env.status || 'unknown',
            url: env.url || null,
            model_version: env.model_version || null,
            runtime_version: env.runtime_version || null,
            warning_count: 0,
            error_count: 0
          };
        });

        try {
          // Test service role permissions first
          console.log('Testing service role permissions...');
          console.log('Service role context:', {
            hasServiceKey: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
            sampleEnvironment: validatedResults[0] ? {
              user_id: validatedResults[0].user_id,
              credential_id: validatedResults[0].credential_id,
              app_id: validatedResults[0].app_id,
              environment_name: validatedResults[0].environment_name
            } : 'No environments to insert'
          });

          const { data: insertedData, error: envInsertError } = await supabase
            .from('mendix_environments')
            .insert(validatedResults)
            .select();

          if (envInsertError) {
            console.error('Database insertion error details:', {
              error: envInsertError,
              message: envInsertError.message,
              details: envInsertError.details,
              hint: envInsertError.hint,
              code: envInsertError.code
            });
            console.error('First 2 records that failed to insert:', JSON.stringify(validatedResults.slice(0, 2), null, 2));
            
            // If this fails, return an error response
            return new Response(JSON.stringify({ 
              error: 'Failed to store environment data', 
              details: envInsertError.message,
              environments_attempted: environmentResults.length
            }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          } else {
            console.log(`Successfully inserted ${insertedData?.length || 0} environments into database`);
            console.log('Sample inserted environment:', insertedData?.[0] ? {
              id: insertedData[0].id,
              environment_name: insertedData[0].environment_name,
              app_id: insertedData[0].app_id,
              status: insertedData[0].status
            } : 'None');
          }
        } catch (insertionError) {
          console.error('Unexpected error during environment insertion:', insertionError);
          console.error('Stack trace:', insertionError instanceof Error ? insertionError.stack : 'No stack trace');
          
          // Return error response for unexpected errors
          return new Response(JSON.stringify({ 
            error: 'Unexpected error during environment insertion', 
            details: insertionError instanceof Error ? insertionError.message : String(insertionError)
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      } else {
        console.log('No environment results to store');
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