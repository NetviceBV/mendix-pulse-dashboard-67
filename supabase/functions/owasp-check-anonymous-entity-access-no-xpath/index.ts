import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StepResult {
  status: 'pass' | 'fail' | 'error';
  details: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body
    const { credential_id, project_id, environment_name, user_id } = await req.json();

    if (!credential_id || !project_id || !environment_name || !user_id) {
      return new Response(
        JSON.stringify({
          status: 'error',
          details: 'Missing required parameters: credential_id, project_id, environment_name, user_id',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[OWASP A01] Starting anonymous entity access check for project: ${project_id}`);

    // Fetch Mendix credentials
    const { data: credentials, error: credError } = await supabase
      .from('mendix_credentials')
      .select('*')
      .eq('id', credential_id)
      .eq('user_id', user_id)
      .single();

    if (credError || !credentials) {
      console.error('Failed to fetch credentials:', credError);
      return new Response(
        JSON.stringify({
          status: 'error',
          details: 'Failed to fetch Mendix credentials',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!credentials.pat) {
      return new Response(
        JSON.stringify({
          status: 'error',
          details: 'Personal Access Token (PAT) is required for this check',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch app details to get project_id and determine branch
    const { data: app, error: appError } = await supabase
      .from('mendix_apps')
      .select('project_id, version')
      .eq('project_id', project_id)
      .eq('user_id', user_id)
      .single();

    if (appError || !app) {
      console.error('Failed to fetch app details:', appError);
      return new Response(
        JSON.stringify({
          status: 'error',
          details: 'Failed to fetch application details',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const projectId = app.project_id;
    if (!projectId) {
      return new Response(
        JSON.stringify({
          status: 'error',
          details: 'Project ID not found for this application',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine branch name based on version format
    const branchName = /^[a-f0-9]{40}$/i.test(app.version || '') ? 'main' : 'trunk';
    console.log(`[OWASP A01] Using branch: ${branchName} for project: ${projectId}`);

    // Import Mendix SDK
    const { MendixPlatformClient, setPlatformConfig } = await import("npm:mendixplatformsdk@5.0.0");
    const { domainmodels } = await import("npm:mendixmodelsdk@4.102.0");

    // Configure SDK
    setPlatformConfig({ mendixToken: credentials.pat });
    const client = new MendixPlatformClient();

    console.log('[OWASP A01] Analyzing entities for anonymous access without XPath...');

    // Get the app and create working copy
    const mendixApp = client.getApp(projectId);
    const workingCopy = await mendixApp.createTemporaryWorkingCopy(branchName);
    console.log(`[OWASP A01] Working copy created: ${workingCopy.workingCopyId}`);

    const model = await workingCopy.openModel();
    console.log('[OWASP A01] Model opened successfully');

    // Helper function to check if an entity is persistable
    async function isPersistable(entity: any): Promise<boolean> {
      try {
        const generalization = entity.generalization;
        
        if (!generalization) {
          console.log(`Entity ${entity.name} has no generalization - treating as non-persistable`);
          return false;
        }
        
        // If it's NoGeneralization (root ancestor), return its persistable property
        if (generalization instanceof domainmodels.NoGeneralization) {
          const isPersist = generalization.persistable;
          console.log(`Entity ${entity.name} reached NoGeneralization, persistable: ${isPersist}`);
          return isPersist;
        }
        
        // If it's Generalization (has parent), always traverse to the parent
        if (generalization instanceof domainmodels.Generalization) {
          const parentEntity = generalization.generalization;
          if (!parentEntity) {
            console.log(`Entity ${entity.name} has Generalization of System - treating as persistable`);
            return true;
          }
          
          console.log(`Entity ${entity.name} inherits from parent, traversing up...`);
          await parentEntity.load();
          // Always recursively traverse to find the root NoGeneralization
          return await isPersistable(parentEntity);
        }
        
        console.log(`Entity ${entity.name} has unknown generalization type - treating as non-persistable`);
        return false;
      } catch (error) {
        console.error(`Error checking persistability for entity ${entity.name}:`, error);
        return false;
      }
    }

    // Get ProjectSecurity
    const allSecurityUnits = model.allProjectSecurities();
    console.log(`[OWASP A01] Found ${allSecurityUnits.length} project security units`);
    
    if (allSecurityUnits.length === 0) {
      return new Response(
        JSON.stringify({
          status: 'pass',
          details: '✓ No project security configuration found',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const projectSecurity = allSecurityUnits[0];
    await projectSecurity.load();
    console.log('[OWASP A01] Project security loaded');
    console.log(`[OWASP A01] Enable guest access: ${projectSecurity.enableGuestAccess}`);
    console.log(`[OWASP A01] Guest user role name: ${projectSecurity.guestUserRoleName}`);
    
    // Check if guest/anonymous access is enabled
    if (!projectSecurity.enableGuestAccess) {
      console.log('[OWASP A01] Guest/Anonymous access is not enabled');
      return new Response(
        JSON.stringify({
          status: 'pass',
          details: '✓ Anonymous/guest access is not enabled in this application',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const guestUserRoleName = projectSecurity.guestUserRoleName;
    
    if (!guestUserRoleName) {
      console.log('[OWASP A01] Guest access is enabled but no role name is specified');
      return new Response(
        JSON.stringify({
          status: 'pass',
          details: '✓ Guest access is enabled but no guest user role is configured',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[OWASP A01] Guest/Anonymous role name: ${guestUserRoleName}`);
    
    // Find all module roles that are mapped to the guest/anonymous user role
    const guestModuleRoles: Array<{ name: string; qualifiedName: string }> = [];
    
    // Get all user roles from project security
    const userRoles = projectSecurity.userRoles;
    console.log(`[OWASP A01] Found ${userRoles.length} user roles in project security`);
    
    // Find the guest user role object
    let guestUserRole = null;
    for (const userRole of userRoles) {
      if (userRole && userRole.name === guestUserRoleName) {
        guestUserRole = userRole;
        console.log(`[OWASP A01] Found guest user role: ${guestUserRoleName}`);
        break;
      }
    }
    
    if (!guestUserRole) {
      console.log(`[OWASP A01] Could not find user role with name: ${guestUserRoleName}`);
      return new Response(
        JSON.stringify({
          status: 'pass',
          details: '✓ Guest user role exists but has no module roles mapped',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Collect all module roles that are mapped to the guest user role
    console.log(`[OWASP A01] Guest user role has ${guestUserRole.moduleRoles.length} module roles`);
    for (const moduleRole of guestUserRole.moduleRoles) {
      if (moduleRole && moduleRole.name && moduleRole.qualifiedName) {
        guestModuleRoles.push({
          name: moduleRole.name,
          qualifiedName: moduleRole.qualifiedName
        });
        console.log(`[OWASP A01] Guest role mapped to module role: ${moduleRole.name} (${moduleRole.qualifiedName})`);
      } else {
        console.log(`[OWASP A01] Warning: Found null or incomplete module role in guest user role mappings`);
      }
    }
    
    if (guestModuleRoles.length === 0) {
      console.log(`[OWASP A01] Guest role "${guestUserRoleName}" has no valid module roles mapped`);
      return new Response(
        JSON.stringify({
          status: 'pass',
          details: '✓ Guest user role exists but has no module roles mapped',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all domain models
    const domainModels = model.allDomainModels();
    console.log(`[OWASP A01] Found ${domainModels.length} domain models`);

    const entitiesWithAnonymousAccessNoXPath: Array<{ module: string; name: string; qualifiedName: string }> = [];

    for (const domainModel of domainModels) {
      await domainModel.load();
      const moduleName = domainModel.containerAsModule ? domainModel.containerAsModule.name : 'Unknown';
      console.log(`[OWASP A01] Processing domain model: ${moduleName}`);

      for (const entity of domainModel.entities) {
        if (!(entity instanceof domainmodels.Entity)) continue;
        if (!entity) {
          console.log('[OWASP A01] Warning: Found null entity in domain model');
          continue;
        }

        await entity.load();
        
        const entityName = entity.name || 'UnknownEntity';
        const entityQualifiedName = entity.qualifiedName || 'Unknown';

        // Check if entity is persistable
        const persistable = await isPersistable(entity);
        
        if (!persistable) {
          console.log(`[OWASP A01] Skipping non-persistable entity: ${entityName}`);
          continue;
        }

        const accessRules = entity.accessRules || [];
        
        // Filter rules for guest/anonymous users
        const anonymousAccessRules = accessRules.filter((rule: any) => {
          if (!rule || !rule.moduleRoles) return false;
          return rule.moduleRoles.some((moduleRole: any) => {
            if (!moduleRole) return false;
            return guestModuleRoles.some(guestModuleRole => 
              moduleRole.qualifiedName === guestModuleRole.qualifiedName
            );
          });
        });

        if (anonymousAccessRules.length > 0) {
          // Check if any rule has no XPath constraint
          const hasRuleWithoutXPath = anonymousAccessRules.some((rule: any) => 
            !rule.xPathConstraint || rule.xPathConstraint.trim() === ''
          );
          
          if (hasRuleWithoutXPath) {
            console.log(`[OWASP A01] Found entity with anonymous access and no XPath: ${moduleName}.${entityName}`);
            entitiesWithAnonymousAccessNoXPath.push({
              module: moduleName,
              name: entityName,
              qualifiedName: entityQualifiedName
            });
          }
        }
      }
    }

    const totalVulnerable = entitiesWithAnonymousAccessNoXPath.length;

    if (totalVulnerable === 0) {
      console.log('[OWASP A01] No vulnerable entities found');
      return new Response(
        JSON.stringify({
          status: 'pass',
          details: '✓ Anonymous access is enabled all entities have XPath constraints',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build entity list for details message
    const entityList = entitiesWithAnonymousAccessNoXPath
      .map(e => `${e.module}.${e.name}`)
      .join(', ');

    console.log(`[OWASP A01] Found ${totalVulnerable} vulnerable entities`);
    return new Response(
      JSON.stringify({
        status: 'fail',
        details: `✗ SECURITY ISSUE: Found ${totalVulnerable} persistable entit${totalVulnerable === 1 ? 'y' : 'ies'} with anonymous access and no XPath constraints. Vulnerable entities: ${entityList}`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[OWASP A01] Error during analysis:', error);
    return new Response(
      JSON.stringify({
        status: 'error',
        details: `Failed to analyze project: ${error.message}`,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
