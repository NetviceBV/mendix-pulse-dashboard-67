import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CloudAction {
  id: string;
  user_id: string;
  credential_id: string;
  app_id: string;
  environment_name: string;
  action_type: 'start' | 'stop' | 'restart' | 'deploy' | 'transport';
  payload?: any;
  current_step?: string;
  step_data?: any;
  package_id?: string;
  backup_id?: string;
}

interface StepResult {
  completed?: boolean;
  nextStep?: string;
  stepData?: any;
  packageId?: string;
  backupId?: string;
  error?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { action, step } = await req.json();

    if (!action || !step) {
      throw new Error('Missing action or step parameter');
    }

    console.log(`🔧 Processing step '${step}' for action ${action.id} (${action.action_type})`);

    const result = await processStep(action, step, supabase);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in cloud action steps:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function processStep(action: CloudAction, step: string, supabase: any): Promise<StepResult> {
  // Get credentials
  const { data: credential } = await supabase
    .from('mendix_credentials')
    .select('*')
    .eq('id', action.credential_id)
    .eq('user_id', action.user_id)
    .single();

  if (!credential) {
    throw new Error('Credentials not found');
  }

  // Get app details
  const { data: app } = await supabase
    .from('mendix_apps')
    .select('*')
    .eq('project_id', action.app_id)
    .eq('user_id', action.user_id)
    .single();

  if (!app) {
    throw new Error('Application not found');
  }

  // Guard: Ensure app_id (slug) exists
  if (!app.app_id) {
    return { error: 'FATAL: Missing app slug (mendix_apps.app_id). Please re-run Fetch Apps from credentials settings.' };
  }

  console.log(`🔧 Processing action for app_slug: ${app.app_id}, display: ${app.app_name}, project_id: ${app.project_id}`);

  const normalizedEnvName = normalizeEnvironmentName(action.environment_name);

  switch (step) {
    // START ACTION STEPS
    case 'call_start':
      return await callStart(credential, app, normalizedEnvName);

    case 'wait_running':
      return await waitForStatus(credential, app, action, 'running', 'Running');

    // STOP ACTION STEPS  
    case 'call_stop':
      if (action.action_type === 'stop') {
        return await callStop(credential, app, normalizedEnvName);
      } else if (action.action_type === 'restart') {
        const result = await callStop(credential, app, normalizedEnvName);
        return { ...result, nextStep: 'wait_stopped' };
      }
      throw new Error(`Invalid step ${step} for action type ${action.action_type}`);

    case 'wait_stopped':
      return await waitForStatus(credential, app, action, 'stopped', 'Stopped', 'call_start');

    // DEPLOY ACTION STEPS
    case 'create_package':
      return await createPackage(credential, app, action);

    case 'wait_package_build':
      return await waitPackageBuild(credential, app, action);

    case 'transport_package':
      return await transportPackage(credential, app, action, normalizedEnvName);

    case 'stop_environment':
      const stopResult = await callStop(credential, app, normalizedEnvName);
      return { ...stopResult, nextStep: 'wait_environment_stopped' };

    case 'wait_environment_stopped':
      return await waitForStatus(credential, app, action, 'stopped', 'Stopped', 'create_backup');

    case 'create_backup':
      return await createBackup(credential, app, action, normalizedEnvName);

    case 'wait_backup_complete':
      return await waitBackupComplete(credential, app, action, 'start_environment');

    case 'start_environment':
      const startResult = await callStart(credential, app, normalizedEnvName);
      return { ...startResult, nextStep: 'wait_environment_running' };

    case 'wait_environment_running':
      return await waitForStatus(credential, app, action, 'running', 'Running', null, true);

    // TRANSPORT ACTION STEPS
    case 'retrieve_source_package':
      return await retrieveSourcePackage(credential, app, action);

    default:
      throw new Error(`Unknown step: ${step}`);
  }
}

// Helper function to normalize environment names
function normalizeEnvironmentName(envName: string): string {
  return envName.charAt(0).toUpperCase() + envName.slice(1).toLowerCase();
}

// START/STOP operations
async function callStart(credential: any, app: any, environmentName: string): Promise<StepResult> {
  const response = await callMendix('start', credential, app.app_id, environmentName);
  if (response.success) {
    return { nextStep: 'wait_running' };
  } else {
    return { error: response.error };
  }
}

async function callStop(credential: any, app: any, environmentName: string): Promise<StepResult> {
  const response = await callMendix('stop', credential, app.app_id, environmentName);
  if (response.success) {
    return { completed: true };
  } else {
    return { error: response.error };
  }
}

// Status polling
async function waitForStatus(
  credential: any, 
  app: any, 
  action: CloudAction, 
  targetStatus: string, 
  displayStatus: string,
  nextStep?: string | null,
  isCompleted: boolean = false
): Promise<StepResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Call refresh environment status
  const { data: statusData, error } = await supabase.functions.invoke('refresh-mendix-environment-status', {
    body: {
      credentialId: action.credential_id,
      appId: action.app_id,
      environmentName: action.environment_name,
      userId: action.user_id
    }
  });

  if (error) {
    return { error: `Failed to refresh environment status: ${error.message}` };
  }

  const currentStatus = statusData?.environment?.status?.toLowerCase();
  console.log(`Environment status: ${currentStatus}, target: ${targetStatus}`);

  if (currentStatus === targetStatus.toLowerCase()) {
    if (isCompleted || nextStep === null) {
      return { completed: true };
    } else {
      return { nextStep: nextStep! };
    }
  } else {
    // Still waiting, continue in next cycle
    return { 
      nextStep: `wait_${targetStatus}`,
      stepData: { 
        targetStatus, 
        displayStatus,
        startTime: action.step_data?.startTime || new Date().toISOString()
      }
    };
  }
}

// Package operations for deploy
async function createPackage(credential: any, app: any, action: CloudAction): Promise<StepResult> {
  const branch = action.payload?.branchName || 'main';
  const revision = action.payload?.revisionId || 'HEAD';

  console.log(`🔧 Creating package for app_slug: ${app.app_id}, display: ${app.app_name}, project_id: ${app.project_id}`);

  try {
    const url = `https://deploy.mendix.com/api/1/apps/${encodeURIComponent(app.app_id)}/packages`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Mendix-Username': credential.username,
        'Mendix-ApiKey': credential.api_key || credential.pat || ''
      },
      body: JSON.stringify({
        Branch: branch,
        Revision: revision,
        Version: action.payload?.version || "1.0.0",
        Description: action.payload?.description || "Pintosoft deployment"
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMsg = `Failed to create package: ${response.status} - ${errorText}`;
      
      // Check for fatal errors that shouldn't be retried
      if (response.status === 404 || errorText.includes('APP_NOT_FOUND') || 
          response.status === 401 || errorText.includes('INVALID_CREDENTIALS')) {
        return { error: `FATAL: ${errorMsg}` };
      }
      
      return { error: errorMsg };
    }

    const data = await response.json();
    const packageId = data.PackageId;

    if (!packageId) {
      return { error: 'Package ID not returned from Mendix API' };
    }

    console.log(`Created package ${packageId} for branch ${branch}`);
    
    return {
      nextStep: 'wait_package_build',
      packageId: packageId,
      stepData: { 
        branch, 
        revision, 
        startTime: new Date().toISOString() 
      }
    };

  } catch (error) {
    return { error: `Package creation failed: ${error.message}` };
  }
}

async function waitPackageBuild(credential: any, app: any, action: CloudAction): Promise<StepResult> {
  if (!action.package_id) {
    return { error: 'Package ID missing for build status check' };
  }

  try {
    const url = `https://deploy.mendix.com/api/1/apps/${encodeURIComponent(app.app_id)}/packages/${encodeURIComponent(action.package_id)}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Mendix-Username': credential.username,
        'Mendix-ApiKey': credential.api_key || credential.pat || ''
      }
    });

    if (!response.ok) {
      return { error: `Failed to check package status: ${response.status}` };
    }

    const data = await response.json();
    const status = data.Status;

    console.log(`Package ${action.package_id} status: ${status}`);

    if (status === 'Available' || status === 'Succeeded') {
      return { nextStep: 'transport_package' };
    } else if (status === 'Failed') {
      return { error: `Package build failed: ${data.ErrorMessage || 'Unknown error'}` };
    } else {
      // Still building
      return { 
        nextStep: 'wait_package_build',
        stepData: { 
          ...action.step_data,
          lastChecked: new Date().toISOString()
        }
      };
    }

  } catch (error) {
    return { error: `Package status check failed: ${error.message}` };
  }
}

async function transportPackage(credential: any, app: any, action: CloudAction, environmentName: string): Promise<StepResult> {
  if (!action.package_id) {
    return { error: 'Package ID missing for transport' };
  }

  try {
    const url = `https://deploy.mendix.com/api/1/apps/${encodeURIComponent(app.app_id)}/environments/${encodeURIComponent(environmentName)}/transport`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Mendix-Username': credential.username,
        'Mendix-ApiKey': credential.api_key || credential.pat || ''
      },
      body: JSON.stringify({
        PackageId: action.package_id
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { error: `Failed to transport package: ${response.status} - ${errorText}` };
    }

    console.log(`Package ${action.package_id} transported to ${environmentName}`);
    
    return { nextStep: 'stop_environment' };

  } catch (error) {
    return { error: `Package transport failed: ${error.message}` };
  }
}

// Backup operations
async function createBackup(credential: any, app: any, action: CloudAction, environmentName: string): Promise<StepResult> {
  try {
    const url = `https://deploy.mendix.com/api/1/apps/${encodeURIComponent(app.app_id)}/environments/${encodeURIComponent(environmentName)}/snapshots`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Mendix-Username': credential.username,
        'Mendix-ApiKey': credential.api_key || credential.pat || ''
      },
      body: JSON.stringify({
        Comment: `Automated backup before deployment - ${new Date().toISOString()}`
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Backup failure shouldn't stop deployment
      console.log(`Backup creation failed (continuing): ${response.status} - ${errorText}`);
      return { nextStep: 'start_environment' };
    }

    const data = await response.json();
    const backupId = data.SnapshotId;

    console.log(`Created backup ${backupId} for environment ${environmentName}`);
    
    return {
      nextStep: 'wait_backup_complete',
      backupId: backupId,
      stepData: { startTime: new Date().toISOString() }
    };

  } catch (error) {
    // Backup failure shouldn't stop deployment
    console.log(`Backup creation failed (continuing): ${error.message}`);
    return { nextStep: 'start_environment' };
  }
}

async function waitBackupComplete(credential: any, app: any, action: CloudAction, nextStep: string): Promise<StepResult> {
  if (!action.backup_id) {
    // No backup ID, skip to next step
    return { nextStep };
  }

  try {
    const url = `https://deploy.mendix.com/api/1/apps/${encodeURIComponent(app.app_id)}/snapshots/${encodeURIComponent(action.backup_id)}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Mendix-Username': credential.username,
        'Mendix-ApiKey': credential.api_key || credential.pat || ''
      }
    });

    if (!response.ok) {
      // Backup check failed, continue anyway
      console.log(`Backup status check failed (continuing): ${response.status}`);
      return { nextStep };
    }

    const data = await response.json();
    const status = data.State;

    console.log(`Backup ${action.backup_id} status: ${status}`);

    if (status === 'Completed') {
      return { nextStep };
    } else if (status === 'Failed') {
      // Backup failed, continue anyway
      console.log(`Backup failed (continuing): ${data.Comment || 'Unknown error'}`);
      return { nextStep };
    } else {
      // Still in progress
      return { 
        nextStep: 'wait_backup_complete',
        stepData: { 
          ...action.step_data,
          lastChecked: new Date().toISOString()
        }
      };
    }

  } catch (error) {
    // Backup check failed, continue anyway
    console.log(`Backup status check failed (continuing): ${error.message}`);
    return { nextStep };
  }
}

// Transport-specific operations
async function retrieveSourcePackage(credential: any, app: any, action: CloudAction): Promise<StepResult> {
  const sourceEnvironment = action.payload?.sourceEnvironment;
  if (!sourceEnvironment) {
    return { error: 'Source environment not specified for transport' };
  }

  try {
    const url = `https://deploy.mendix.com/api/1/apps/${encodeURIComponent(app.app_id)}/environments/${encodeURIComponent(sourceEnvironment)}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Mendix-Username': credential.username,
        'Mendix-ApiKey': credential.api_key || credential.pat || ''
      }
    });

    if (!response.ok) {
      return { error: `Failed to get source environment info: ${response.status}` };
    }

    const data = await response.json();
    const packageId = data.PackageId;

    if (!packageId) {
      return { error: `No package found in source environment ${sourceEnvironment}` };
    }

    console.log(`Retrieved package ${packageId} from source environment ${sourceEnvironment}`);
    
    return {
      nextStep: 'transport_package',
      packageId: packageId,
      stepData: { sourceEnvironment }
    };

  } catch (error) {
    return { error: `Failed to retrieve source package: ${error.message}` };
  }
}

// Helper function to call Mendix API for start/stop
async function callMendix(action: string, credential: any, appSlug: string, environmentName: string) {
  try {
    const url = `https://deploy.mendix.com/api/1/apps/${encodeURIComponent(appSlug)}/environments/${encodeURIComponent(environmentName)}/${action}`;
    
    const body = action === 'start' ? JSON.stringify({ AutoSyncDb: true }) : undefined;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Mendix-Username': credential.username,
        'Mendix-ApiKey': credential.api_key || credential.pat || ''
      },
      body: body
    });

    if (response.ok) {
      console.log(`Successfully called ${action} for ${appSlug}/${environmentName}`);
      return { success: true };
    } else {
      const errorText = await response.text();
      return { 
        success: false, 
        error: `Mendix API ${action} failed: ${response.status} - ${errorText}` 
      };
    }
  } catch (error) {
    return { 
      success: false, 
      error: `Mendix API call failed: ${error.message}` 
    };
  }
}