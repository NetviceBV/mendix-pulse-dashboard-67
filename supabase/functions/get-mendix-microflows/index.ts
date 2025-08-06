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

    // Get the project_id and version from mendix_apps table
    const { data: appData, error: appError } = await supabase
      .from('mendix_apps')
      .select('project_id, version')
      .eq('app_id', appId)
      .eq('user_id', user.id)
      .single();

    if (appError || !appData || !appData.project_id) {
      throw new Error(`Project ID not found for app: ${appId}. Please ensure the app has been fetched and stored in the database.`);
    }

    const projectId = appData.project_id;
    const version = appData.version;
    
    // Determine branch based on Mendix version
    // MX10: version ends with git hash (hexadecimal) -> use "main"
    // MX9: version is semantic or ends with numeric -> use "trunk"
    function detectMendixBranch(version: string): string {
      if (!version) return "main"; // fallback to main
      
      // Check if version ends with a git hash (hexadecimal pattern)
      const gitHashPattern = /[a-f0-9]{6,}$/i;
      const isMX10 = gitHashPattern.test(version);
      
      return isMX10 ? "main" : "trunk";
    }
    
    const branchName = detectMendixBranch(version);
    console.log(`Fetching microflows for app: ${appId}, project: ${projectId}, version: ${version}, branch: ${branchName}`);

    // Import Mendix SDK with npm compatibility
    const { MendixPlatformClient } = await import("npm:mendixplatformsdk@5.2.0");

    const client = new MendixPlatformClient();
    const mendixApp = client.getApp(projectId);
    
    const workingCopy = await mendixApp.createTemporaryWorkingCopy(branchName);
    const model = await workingCopy.openModel();

      // Get all modules and microflows
      const allModules = model.allModules();
      console.log('Available modules:', allModules.map(m => m.name));

      const allMicroflows = model.allMicroflows();
      console.log(`Total microflows found: ${allMicroflows.length}`);

      // Helper function to safely get module name from a microflow
      function getModuleName(microflow: any): string | null {
      try {
        
        
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