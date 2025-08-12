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

    const { credentialId, appId, includeActivities = false, targetMicroflow } = await req.json();

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

      // Helper to resolve Mendix Text objects to a readable string
      function resolveText(val: any): string | null {
        try {
          if (!val) return null;
          if (typeof val === 'string') {
            const s = val.trim();
            return s.length ? s : null;
          }
          if (typeof val === 'object') {
            // 1) Array of translations: [{ languageCode/languageTag, text/value }]
            if (Array.isArray(val.translations)) {
              const preferred = ['en', 'en_US', 'en-GB', 'nl', 'nl_NL', 'nl-BE'];
              for (const p of preferred) {
                const t = val.translations.find((tr: any) =>
                  (tr.languageCode && (tr.languageCode === p || tr.languageCode?.startsWith(p))) ||
                  (tr.languageTag && (tr.languageTag === p || tr.languageTag?.startsWith(p)))
                );
                const text = t?.text ?? t?.value;
                if (text && String(text).trim()) return String(text).trim();
              }
              for (const t of val.translations) {
                const text = t?.text ?? t?.value;
                if (text && String(text).trim()) return String(text).trim();
              }
            }
            // 2) Object map of translations: { en: string, nl: string, ... }
            if (val.translations && typeof val.translations === 'object' && !Array.isArray(val.translations)) {
              const candidates = ['en', 'en_US', 'en-GB', 'nl', 'nl_NL', 'nl-BE'];
              for (const key of candidates) {
                const text = val.translations[key];
                if (text && String(text).trim()) return String(text).trim();
              }
              for (const k in val.translations) {
                const text = val.translations[k];
                if (text && String(text).trim()) return String(text).trim();
              }
            }
            // 3) Nested text fields
            if (val.text) {
              const nested = resolveText(val.text);
              if (nested) return nested;
            }
            if (val.value && String(val.value).trim()) return String(val.value).trim();
          }
          return null;
        } catch {
          return null;
        }
      }

      // Treat very generic auto-generated captions as non-informative
      function isGenericCaption(s: string | null | undefined): boolean {
        if (!s) return false;
        const v = String(s).trim();
        const GENERIC = new Set([
          'Activity',
          'Action',
          'Submicroflow',
          // Dutch common generics
          'Activiteit',
          'Actie',
        ]);
        return GENERIC.has(v);
      }

      // Helper function to extract meaningful activity names
      function extractActivityName(obj: any): string {
        const type = obj?.$Type || '';
        const caption = resolveText(obj?.caption);

        // 1) For ActionActivity, prefer derived action name over generic captions
        if (type.endsWith('ActionActivity') && obj?.action) {
          const action = obj.action;
          const aType: string = action.$Type || '';

          if (aType.endsWith('MicroflowCallAction')) {
            return `Call ${action.microflowCall?.qualifiedName || action.microflowCall?.name || 'Microflow'}`;
          }
          if (aType.endsWith('ShowPageAction')) {
            return `Show ${action.pageSettings?.page?.name || 'Page'}`;
          }
          if (aType.endsWith('RetrieveAction')) {
            return action.outputVariableName
              ? `Retrieve ${action.outputVariableName}`
              : `Retrieve ${action.entity?.qualifiedName || 'objects'}`;
          }
          if (aType.endsWith('CreateObjectAction')) {
            return action.outputVariableName
              ? `Create ${action.outputVariableName}`
              : `Create ${action.entity?.qualifiedName || 'object'}`;
          }
          if (aType.endsWith('ChangeObjectAction')) {
            return action.changeVariableName
              ? `Change ${action.changeVariableName}`
              : 'Change object';
          }
          if (aType.endsWith('CommitAction')) return 'Commit';
          if (aType.endsWith('RollbackAction')) return 'Rollback';
          if (aType.endsWith('DeleteAction')) return 'Delete object';
          if (aType.endsWith('LogMessageAction')) {
            const t = resolveText(action.template) || resolveText(action.messageTemplate);
            if (t) return `Log: ${t.slice(0, 40)}${t.length > 40 ? '…' : ''}`;
            return 'Log message';
          }
          if (aType.includes('Rest') || aType.includes('CallRestService')) return 'REST call';
          if (aType.includes('WebService')) return 'Web service call';
          if (aType.endsWith('JavaActionCallAction')) {
            return `Call Java action ${action.javaAction?.qualifiedName || ''}`.trim();
          }

          // If we couldn't decode action type and caption is informative, use it
          if (caption && !isGenericCaption(caption)) return caption;
        } else {
          // 2) Non-action objects: trust explicit caption first
          if (caption) return caption;
        }

        // 3) Events and flow objects
        const cleanType = (type || 'Unknown').replace(/^.*\$/, '');
        if (cleanType.includes('StartEvent')) return 'Start';
        if (cleanType.includes('EndEvent')) return 'End';
        if (cleanType.includes('ExclusiveSplit') || cleanType.includes('Decision')) return 'Decision';
        if (cleanType.includes('ExclusiveMerge')) return 'Merge';
        if (cleanType.includes('ParallelSplit')) return 'Parallel split';
        if (cleanType.includes('ParallelMerge')) return 'Parallel merge';

        // 4) Fallback to cleaned type
        return cleanType.replace(/([A-Z])/g, ' $1').trim();
      }

      // Helper function to extract microflow activities
      async function extractMicroflowActivities(microflow: any): Promise<any[]> {
        try {
          // Load the microflow fully before accessing objectCollection
          console.log(`Loading microflow ${microflow.name} to extract activities...`);
          await microflow.load();
          
          if (!microflow.objectCollection) {
            console.warn(`No objectCollection found for microflow ${microflow.name}`);
            return [];
          }

          // Use the toJSON() method as suggested in the Mendix SDK documentation
          const objectCollectionData = microflow.objectCollection.toJSON();
          console.log(`Extracted ${objectCollectionData?.objects?.length || 0} activities from microflow ${microflow.name}`);
          
          if (!objectCollectionData?.objects) {
            return [];
          }

          const unknownActionTypes = new Set<string>();
          let resolvedCaptionCount = 0;

          // Extract and enhance activity information
          const activities = objectCollectionData.objects.map((obj: any) => {
            const captionText = resolveText(obj?.caption) || resolveText(obj?.text);
            if (captionText) resolvedCaptionCount++;

            const cleanType = (obj.$Type || 'Unknown').replace(/^.*\$/, '');
            const name = extractActivityName(obj);
            const fallbackName = cleanType.replace(/([A-Z])/g, ' $1').trim();
            const actionType = obj?.action?.$Type;
            if (cleanType.endsWith('ActionActivity') && actionType && name === fallbackName) {
              unknownActionTypes.add(actionType);
            }
            
            return {
              id: obj.id,
              type: cleanType,
              name,
              position: obj.relativeMiddlePoint ? {
                x: obj.relativeMiddlePoint.x || 0,
                y: obj.relativeMiddlePoint.y || 0
              } : null,
              properties: {
                caption: obj.caption,
                text: obj.text,
                documentation: obj.documentation,
                originalType: obj.$Type,
                originalActionType: actionType,
                captionText
              }
            };
          });

          // Sort activities by position if available (top-to-bottom, then left-to-right)
          activities.sort((a, b) => {
            if (a.position && b.position) {
              // Slightly tighter threshold for considering the same row
              if (Math.abs(a.position.y - b.position.y) > 32) {
                return a.position.y - b.position.y;
              }
              return a.position.x - b.position.x;
            }
            // If no position data, maintain original order
            return 0;
          });

          const rawSample = (objectCollectionData?.objects || []).slice(0, 3).map((o: any) => ({
            id: o.id,
            $Type: o.$Type,
            actionType: o?.action?.$Type,
            caption: o.caption,
            text: o.text,
            names: {
              microflow: o.action?.microflowCall?.qualifiedName || o.action?.microflowCall?.name,
              page: o.action?.pageSettings?.page?.name,
              entity: o.action?.entity?.qualifiedName,
              outputVariableName: o.action?.outputVariableName,
              changeVariableName: o.action?.changeVariableName,
            }
          }));

          console.log(`Raw activities snapshot for ${microflow.name}:`, rawSample);
          console.log(`Activities with positions: ${activities.filter(a => a.position).length}/${activities.length}`);
          console.log(`Resolved captions in ${microflow.name}: ${resolvedCaptionCount}/${activities.length}`);
          console.log(`Sample activities for ${microflow.name}:`, activities.slice(0, 3));
          if (unknownActionTypes.size) {
            console.log(`Unknown action types in ${microflow.name}:`, Array.from(unknownActionTypes));
          }
          
          return activities;
        } catch (error) {
          console.error(`Error extracting activities from microflow ${microflow.name}:`, error);
          return [];
        }
      }

      // Process microflows with safe module name extraction and optional activities
      const filteredMicroflows = allMicroflows.filter(mf => !targetMicroflow || mf.name === targetMicroflow);
      
      const microflowData = await Promise.all(
        filteredMicroflows.map(async (mf) => {
          const moduleName = getModuleName(mf);
          const baseData = {
            name: mf.name,
            module: moduleName,
            qualifiedName: mf.qualifiedName || `${moduleName || 'Unknown'}.${mf.name}`
          };

          // Add activities if requested
          if (includeActivities) {
            const activities = await extractMicroflowActivities(mf);
            return {
              ...baseData,
              activities,
              activityCount: activities.length,
              activityTypes: [...new Set(activities.map(a => a.type))]
            };
          }

          return baseData;
        })
      );

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