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

    if (!credentials.pat) {
      throw new Error('Personal Access Token (PAT) not found in credentials');
    }

    // Import Mendix SDK with npm compatibility
    const { MendixPlatformClient } = await import("npm:mendixplatformsdk@5.2.0");

    console.log(`Fetching microflows for app: ${appId}`);
    console.log('PAT present:', !!credentials.pat);

    // Set the MENDIX_TOKEN environment variable for the SDK
    Deno.env.set('MENDIX_TOKEN', credentials.pat);

    const client = new MendixPlatformClient();
    const mendixApp = client.getApp(appId);
    
    const workingCopy = await mendixApp.createTemporaryWorkingCopy("main");
    const model = await workingCopy.openModel();

    // Get all modules and microflows
    const allModules = model.allModules();
    console.log('Available modules:', allModules.map(m => m.name));

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