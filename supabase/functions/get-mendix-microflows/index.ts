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

    // Verify the JWT and get user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Authentication failed');
    }

    const { credentialId, appId } = await req.json();

    if (!credentialId || !appId) {
      throw new Error('Missing credentialId or appId parameters');
    }

    // Get the Mendix credentials
    const { data: credentials, error: credError } = await supabase
      .from('mendix_credentials')
      .select('*')
      .eq('id', credentialId)
      .eq('user_id', user.id)
      .single();

    if (credError || !credentials) {
      throw new Error('Mendix credentials not found or access denied');
    }

    // Get the project ID from the mendix_apps table using the app ID
    const { data: appData, error: appError } = await supabase
      .from('mendix_apps')
      .select('project_id')
      .eq('app_id', appId)
      .eq('user_id', user.id)
      .single();

    if (appError || !appData || !appData.project_id) {
      throw new Error('App not found or project ID not available');
    }

    const projectId = appData.project_id;
    console.log(`Fetching microflows for app: ${appId}, project ID: ${projectId}`);

    // Ensure MENDIX_TOKEN is available
    const mendixToken = Deno.env.get('MENDIX_TOKEN');
    console.log('MENDIX_TOKEN available:', !!mendixToken);
    
    if (!mendixToken) {
      throw new Error('MENDIX_TOKEN not available in environment');
    }

    try {
      console.log('Attempting to import Mendix SDK...');
      
      // Try alternative import strategy - use ESM import from skypack
      let MendixPlatformClient;
      try {
        const mendixModule = await import("https://cdn.skypack.dev/mendixplatformsdk@5.2.0");
        MendixPlatformClient = mendixModule.MendixPlatformClient;
        console.log('Successfully imported Mendix SDK from Skypack');
      } catch (skypackError) {
        console.log('Skypack import failed, trying npm import:', skypackError.message);
        // Fallback to npm import
        const mendixModule = await import("npm:mendixplatformsdk@5.2.0");
        MendixPlatformClient = mendixModule.MendixPlatformClient;
        console.log('Successfully imported Mendix SDK from npm');
      }

      console.log('Creating Mendix Platform Client...');
      const client = new MendixPlatformClient();
      
      console.log('Getting Mendix app...');
      const mendixApp = client.getApp(projectId);
      
      console.log('Creating temporary working copy...');
      const workingCopy = await mendixApp.createTemporaryWorkingCopy("main");
      
      console.log('Opening model...');
      const model = await workingCopy.openModel();

      // Get all modules and microflows
      console.log('Fetching modules...');
      const allModules = model.allModules();
      console.log('Available modules:', allModules.map(m => m.name));

      console.log('Fetching microflows...');
      const allMicroflows = model.allMicroflows();
      console.log(`Total microflows found: ${allMicroflows.length}`);

      // Helper function to safely get module name from a microflow
      function getModuleName(microflow: any): string | null {
        try {
          // Try to get the module directly
          if (microflow.containerAsModule) {
            return microflow.containerAsModule.name;
          }
          
          // If not directly in a module, traverse up the container hierarchy
          let container = microflow.container;
          while (container) {
            if (container.structureTypeName === 'Projects$Module') {
              return container.name;
            }
            container = container.container;
          }
          
          // Alternative approach: parse from qualified name
          if (microflow.qualifiedName) {
            const parts = microflow.qualifiedName.split('.');
            if (parts.length > 1) {
              return parts[0]; // First part is usually the module name
            }
          }
          
          return null;
        } catch (error) {
          console.warn(`Could not get module name for microflow ${microflow.name}:`, error);
          return null;
        }
      }

      // Process microflows with safe module name extraction
      const microflowData = allMicroflows.map(mf => {
        const moduleName = getModuleName(mf);
        return {
          name: mf.name,
          module: moduleName,
          qualifiedName: mf.qualifiedName || `${moduleName || 'Unknown'}.${mf.name}`
        };
      });

      // Group by module for better overview
      const microflowsByModule = microflowData.reduce((acc, mf) => {
        const module = mf.module || 'Unknown';
        if (!acc[module]) {
          acc[module] = [];
        }
        acc[module].push(mf);
        return acc;
      }, {} as Record<string, any[]>);

      console.log('Microflows grouped by module:', Object.keys(microflowsByModule).map(m => `${m}: ${microflowsByModule[m].length}`));

      return new Response(JSON.stringify({
        success: true,
        data: {
          appId,
          availableModules: allModules.map(m => m.name),
          microflows: microflowData,
          microflowsByModule,
          count: microflowData.length,
          totalCount: allMicroflows.length
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (sdkError) {
      console.error('SDK Error Details:', {
        message: sdkError.message,
        stack: sdkError.stack,
        name: sdkError.name,
        responseData: sdkError.responseData,
        responseStatus: sdkError.responseStatus
      });
      
      // If SDK fails, try direct REST API approach
      console.log('SDK approach failed, attempting direct REST API calls...');
      
      try {
        // Use the user's credentials to make direct API calls to Mendix
        const authHeader = `${credentials.username}:${credentials.api_key}`;
        const encodedAuth = btoa(authHeader);
        
        // First, get the app details to find the project ID
        const appResponse = await fetch(`https://deploy.mendix.com/api/4/apps/${appId}`, {
          headers: {
            'Authorization': `Basic ${encodedAuth}`,
            'Accept': 'application/json'
          }
        });
        
        if (!appResponse.ok) {
          throw new Error(`Failed to fetch app details: ${appResponse.status} ${appResponse.statusText}`);
        }
        
        const appData = await appResponse.json();
        console.log('App data retrieved:', { name: appData.name, projectId: appData.projectId });
        
        // For now, return a message indicating we need to implement the REST API approach
        return new Response(JSON.stringify({
          success: false,
          error: 'SDK_UNAVAILABLE',
          message: 'Mendix SDK is not available in this environment. Direct REST API approach needed.',
          details: {
            appId,
            appName: appData.name,
            projectId: appData.projectId,
            sdkError: sdkError.message
          }
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
        
      } catch (restError) {
        console.error('REST API fallback also failed:', restError);
        throw new Error(`Both SDK and REST API approaches failed. SDK: ${sdkError.message}, REST: ${restError.message}`);
      }
    }

  } catch (error: any) {
    console.error('Error fetching microflows:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to fetch microflows',
      message: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});