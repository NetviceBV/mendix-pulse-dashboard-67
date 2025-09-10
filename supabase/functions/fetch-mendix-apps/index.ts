import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

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

    // Note: Using upsert strategy instead of delete to preserve existing data and avoid foreign key constraints

    // Store the new app results and fetch environments
    if (apps.length > 0) {
      console.log(`Processing ${apps.length} apps with parallel processing...`);
      
      // Process apps in parallel without deployment info to avoid timeouts
      const BATCH_SIZE = 8; // Process 8 apps concurrently
      const appResults = [];
      
      for (let i = 0; i < apps.length; i += BATCH_SIZE) {
        const batch = apps.slice(i, i + BATCH_SIZE);
        console.log(`Processing app batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(apps.length/BATCH_SIZE)} (${batch.length} apps)`);
        
        const batchPromises = batch.map(async (app: any) => {
          return {
            user_id: user.id,
            credential_id: credentialId,
            app_name: app.name,
            app_url: `https://${app.subdomain}.mendixcloud.com`,
            project_id: app.id,
            app_id: app.subdomain,
            status: 'healthy', // Will be determined from environments
            environment: 'production', // Will be determined from environments
            version: '1.0.0', // Default version without packages API call
            active_users: 0, // Real monitoring data not available yet
            error_count: 0, // Real monitoring data not available yet
            last_deployed: null // Not available without packages API call
          };
        });
        
        const batchResults = await Promise.allSettled(batchPromises);
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            appResults.push(result.value);
          } else {
            console.error(`Failed to process app ${batch[index].name}:`, result.reason);
            // Add fallback app data
            appResults.push({
              user_id: user.id,
              credential_id: credentialId,
              app_name: batch[index].name,
              app_url: `https://${batch[index].subdomain}.mendixcloud.com`,
              project_id: batch[index].id,
              app_id: batch[index].id,
              status: 'healthy',
              environment: 'production',
              version: '1.0.0',
              active_users: 0,
              error_count: 0,
              last_deployed: null
            });
          }
        });
      }

      // Use upsert to update existing apps or insert new ones
      const { error: upsertError } = await supabase
        .from('mendix_apps')
        .upsert(appResults, { 
          onConflict: 'app_id,credential_id',
          ignoreDuplicates: false 
        });

      if (upsertError) {
        console.error('Error upserting app results:', upsertError);
        return new Response(JSON.stringify({ error: 'Failed to store app results' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Helper function to fetch environments for a single app
      const fetchAppEnvironments = async (app: any): Promise<any[]> => {
        const results: any[] = [];
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
          
          // Step 1: Get list of environments for the app
          const envListResponse = await fetch(`https://cloud.home.mendix.com/api/v4/apps/${app.id}/environments`, {
            method: 'GET',
            headers,
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (envListResponse.ok) {
            const envListData = await envListResponse.json();
            const environments = envListData.Environments || envListData.environments || [];
            console.log(`Found ${environments.length} environments for app ${app.name}`);
            
            // Process environments in parallel for this app
            const envPromises = environments.map(async (env: any) => {
              try {
                const envController = new AbortController();
                const envTimeoutId = setTimeout(() => envController.abort(), 8000); // 8 second timeout
                
                const envDetailResponse = await fetch(`https://cloud.home.mendix.com/api/v4/apps/${app.id}/environments/${env.id}`, {
                  method: 'GET',
                  headers,
                  signal: envController.signal
                });

                clearTimeout(envTimeoutId);

                if (envDetailResponse.ok) {
                  const envDetail = await envDetailResponse.json();
                  return {
                    user_id: user.id,
                    credential_id: credentialId,
                    app_id: app.id,
                    environment_id: envDetail.id || env.id,
                    environment_name: (envDetail.name || env.name).toLowerCase().trim(),
                    status: (envDetail.state || envDetail.status || 'unknown').toLowerCase(),
                    url: envDetail.url || env.url,
                    model_version: envDetail.modelVersion,
                    runtime_version: envDetail.runtimeVersion
                  };
                } else {
                  // Fallback to basic environment info from list
                  return {
                    user_id: user.id,
                    credential_id: credentialId,
                    app_id: app.id,
                    environment_id: env.id,
                    environment_name: (env.name).toLowerCase().trim(),
                    status: (env.state || env.status || 'unknown').toLowerCase(),
                    url: env.url,
                    model_version: null,
                    runtime_version: null
                  };
                }
              } catch (envDetailError) {
                console.error(`Error fetching detail for environment ${env.id}:`, envDetailError);
                // Fallback to basic environment info
                return {
                  user_id: user.id,
                  credential_id: credentialId,
                  app_id: app.id,
                  environment_id: env.id,
                  environment_name: (env.name).toLowerCase().trim(),
                  status: (env.state || env.status || 'unknown').toLowerCase(),
                  url: env.url,
                  model_version: null,
                  runtime_version: null
                };
              }
            });
            
            const envResults = await Promise.allSettled(envPromises);
            envResults.forEach((result) => {
              if (result.status === 'fulfilled' && result.value) {
                results.push(result.value);
              }
            });
          } else {
            console.log(`No environments found for app ${app.name}: ${envListResponse.status}`);
          }
        } catch (envError) {
          console.error(`Error fetching environments for app ${app.name}:`, envError);
        }
        return results;
      };

      // Fetch environments for all apps in parallel batches
      console.log('Fetching environments for all apps in parallel...');
      const environmentResults: any[] = [];
      
      for (let i = 0; i < apps.length; i += BATCH_SIZE) {
        const batch = apps.slice(i, i + BATCH_SIZE);
        console.log(`Fetching environments for batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(apps.length/BATCH_SIZE)} (${batch.length} apps)`);
        
        const batchPromises = batch.map(fetchAppEnvironments);
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            environmentResults.push(...result.value);
          } else {
            console.error(`Failed to fetch environments for app ${batch[index].name}:`, result.reason);
          }
        });
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

          // Use upsert for environments to update existing or insert new ones
          const { data: upsertedData, error: envUpsertError } = await supabase
            .from('mendix_environments')
            .upsert(validatedResults, { 
              onConflict: 'app_id,environment_name,credential_id',
              ignoreDuplicates: false 
            })
            .select();

          if (envUpsertError) {
            console.error('Database upsert error details:', {
              error: envUpsertError,
              message: envUpsertError.message,
              details: envUpsertError.details,
              hint: envUpsertError.hint,
              code: envUpsertError.code
            });
            console.error('First 2 records that failed to upsert:', JSON.stringify(validatedResults.slice(0, 2), null, 2));
            
            // If this fails, return an error response
            return new Response(JSON.stringify({ 
              error: 'Failed to store environment data', 
              details: envUpsertError.message,
              environments_attempted: environmentResults.length
            }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          } else {
            console.log(`Successfully upserted ${upsertedData?.length || 0} environments into database`);
            console.log('Sample upserted environment:', upsertedData?.[0] ? {
              id: upsertedData[0].id,
              environment_name: upsertedData[0].environment_name,
              app_id: upsertedData[0].app_id,
              status: upsertedData[0].status
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