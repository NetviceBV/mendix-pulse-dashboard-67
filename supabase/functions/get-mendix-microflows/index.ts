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

    const { credentialId, appId, includeActivities = false, includeRaw = false, targetMicroflow } = await req.json();

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
            const mfName =
              action.microflowCall?.qualifiedName ||
              action.microflowCall?.microflowQualifiedName ||
              action.microflowQualifiedName ||
              action.microflowCall?.name;
            return `Call ${mfName || 'Microflow'}`;
          }
          if (aType.endsWith('ShowPageAction')) {
            const pageName =
              action.pageSettings?.pageQualifiedName ||
              action.pageQualifiedName ||
              action.pageSettings?.page?.qualifiedName ||
              action.pageSettings?.page?.name;
            return `Show ${pageName || 'Page'}`;
          }
          if (aType.endsWith('RetrieveAction')) {
            const entityName = action.entity?.qualifiedName || action.entityQualifiedName;
            return action.outputVariableName
              ? `Retrieve ${action.outputVariableName}`
              : `Retrieve ${entityName || 'objects'}`;
          }
          if (aType.endsWith('CreateObjectAction')) {
            const entityName = action.entity?.qualifiedName || action.entityQualifiedName;
            return action.outputVariableName
              ? `Create ${action.outputVariableName}`
              : `Create ${entityName || 'object'}`;
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
      async function extractMicroflowActivities(microflow: any): Promise<{ items: any[]; rawSample?: any[] }> {
        try {
          // Load the microflow fully before accessing objectCollection
          console.log(`Loading microflow ${microflow.name} to extract activities...`);
          await microflow.load();
          
          if (!microflow.objectCollection) {
            console.warn(`No objectCollection found for microflow ${microflow.name}`);
            return { items: [] };
          }

          // Get both typed and plain representations
          const typedObjects: any[] = microflow.objectCollection.objects || [];
          const objectCollectionData = microflow.objectCollection.toJSON();
          const plainObjects: any[] = objectCollectionData?.objects || [];
          console.log(`Extracted ${plainObjects.length} activities from microflow ${microflow.name}`);

          const unknownActionTypes = new Set<string>();
          let resolvedCaptionCount = 0;

          // Safely derive target qualified names using typed SDK objects
          function deriveTargets(typed: any, actionType: string | undefined) {
            const targets: Record<string, string | undefined> = {};
            try {
              if (!typed) return targets;
              // Microflow calls
              if (actionType && actionType.endsWith('MicroflowCallAction')) {
                targets.microflowQualifiedName =
                  typed?.action?.microflowCall?.microflow?.qualifiedName ||
                  typed?.action?.microflowCall?.microflowQualifiedName ||
                  typed?.action?.microflowQualifiedName;
              }
              // Show page
              if (actionType && actionType.endsWith('ShowPageAction')) {
                targets.pageQualifiedName =
                  typed?.action?.pageSettings?.page?.qualifiedName ||
                  typed?.action?.pageSettings?.pageQualifiedName ||
                  typed?.action?.pageQualifiedName;
              }
              // Java action
              if (actionType && actionType.endsWith('JavaActionCallAction')) {
                targets.javaActionQualifiedName = typed?.action?.javaAction?.qualifiedName;
              }
              // Entity-based actions
              if (
                actionType && (
                  actionType.endsWith('CreateObjectAction') ||
                  actionType.endsWith('RetrieveAction') ||
                  actionType.endsWith('ChangeObjectAction')
                )
              ) {
                targets.entityQualifiedName =
                  typed?.action?.entity?.qualifiedName ||
                  typed?.action?.entityQualifiedName;
              }
            } catch (_) {
              // noop
            }
            return targets;
          }

          // Extract and enhance activity information by aligning typed and plain arrays
          const activities = plainObjects.map((obj: any, idx: number) => {
            const typed = typedObjects[idx];
            const captionText = resolveText(obj?.caption) || resolveText(obj?.text);
            if (captionText) resolvedCaptionCount++;

            const cleanType = (obj.$Type || 'Unknown').replace(/^.*\$/, '');
            const actionType = obj?.action?.$Type;

            // Use typed SDK to resolve targets for better names
            const targets = deriveTargets(typed, actionType);

            // Build a richer name using targets when available
            let name = extractActivityName({ ...obj, action: obj.action });
            if (cleanType.endsWith('ActionActivity') && actionType) {
              if (actionType.endsWith('MicroflowCallAction') && targets.microflowQualifiedName) {
                name = `Call ${targets.microflowQualifiedName}`;
              } else if (actionType.endsWith('ShowPageAction') && targets.pageQualifiedName) {
                name = `Show ${targets.pageQualifiedName}`;
              } else if (actionType.endsWith('JavaActionCallAction') && targets.javaActionQualifiedName) {
                name = `Call Java action ${targets.javaActionQualifiedName}`;
              } else if (
                (actionType.endsWith('CreateObjectAction') || actionType.endsWith('RetrieveAction')) &&
                targets.entityQualifiedName
              ) {
                const verb = actionType.endsWith('CreateObjectAction') ? 'Create' : 'Retrieve';
                name = `${verb} ${targets.entityQualifiedName}`;
              }
            }

            const activity = {
              id: obj.id,
              type: cleanType,
              name,
              position: obj.relativeMiddlePoint
                ? { x: obj.relativeMiddlePoint.x || 0, y: obj.relativeMiddlePoint.y || 0 }
                : null,
              properties: {
                caption: obj.caption,
                text: obj.text,
                documentation: obj.documentation,
                originalType: obj.$Type,
                originalActionType: actionType,
                captionText,
                targets,
              },
            };

            if (cleanType.endsWith('ActionActivity') && actionType && name === cleanType.replace(/([A-Z])/g, ' $1').trim()) {
              unknownActionTypes.add(actionType);
            }

            return activity;
          });

          // Sort activities by position if available (top-to-bottom, then left-to-right)
          activities.sort((a, b) => {
            if (a.position && b.position) {
              if (Math.abs(a.position.y - b.position.y) > 32) {
                return a.position.y - b.position.y;
              }
              return a.position.x - b.position.x;
            }
            return 0;
          });

          const rawSample = plainObjects.slice(0, 3).map((o: any, i: number) => {
            const typed = typedObjects[i];
            const actionType = o?.action?.$Type;
            const targets = deriveTargets(typed, actionType);
            return {
              id: o.id,
              $Type: o.$Type,
              actionType: actionType,
              caption: o.caption,
              text: o.text,
              names: {
                microflow: targets.microflowQualifiedName ||
                  o.action?.microflowCall?.qualifiedName ||
                  o.action?.microflowCall?.microflowQualifiedName ||
                  o.action?.microflowQualifiedName ||
                  o.action?.microflowCall?.name,
                page: targets.pageQualifiedName ||
                  o.action?.pageSettings?.pageQualifiedName ||
                  o.action?.pageQualifiedName ||
                  o.action?.pageSettings?.page?.qualifiedName ||
                  o.action?.pageSettings?.page?.name,
                entity: targets.entityQualifiedName ||
                  o.action?.entity?.qualifiedName ||
                  o.action?.entityQualifiedName,
                javaAction: targets.javaActionQualifiedName,
                outputVariableName: o.action?.outputVariableName,
                changeVariableName: o.action?.changeVariableName,
              },
            };
          });

          console.log(`Raw activities snapshot for ${microflow.name}:`, rawSample);
          console.log(`Activities with positions: ${activities.filter(a => a.position).length}/${activities.length}`);
          console.log(`Resolved captions in ${microflow.name}: ${resolvedCaptionCount}/${activities.length}`);
          console.log(`Sample activities for ${microflow.name}:`, activities.slice(0, 3));
          if (unknownActionTypes.size) {
            console.log(`Unknown action types in ${microflow.name}:`, Array.from(unknownActionTypes));
          }
          
          return includeRaw ? { items: activities, rawSample } : { items: activities };
        } catch (error) {
          console.error(`Error extracting activities from microflow ${microflow.name}:`, error);
          return { items: [] };
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
            const res = await extractMicroflowActivities(mf);
            const activities = Array.isArray(res) ? res : res.items;
            const result: any = {
              ...baseData,
              activities,
              activityCount: activities.length,
              activityTypes: [...new Set(activities.map((a: any) => a.type))]
            };
            if (includeRaw && !Array.isArray(res) && res.rawSample) {
              result.debug = { rawSample: res.rawSample };
            }
            return result;
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