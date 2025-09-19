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
  status: string;
  payload?: any;
  current_step?: string;
  step_data?: any;
  package_id?: string;
  backup_id?: string;
  last_heartbeat?: string;
  attempt_count?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    console.log('🚀 Starting cloud actions v2 processor');

    // Check authentication
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    let isInternalCall = false;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (user) {
        userId = user.id;
        console.log(`Authenticated user: ${userId}`);
      }
    } else {
      // Check if this is an internal cron call
      const userAgent = req.headers.get('User-Agent');
      const cronSignature = req.headers.get('x-cron-signature');
      if (userAgent?.includes('pg_cron') || cronSignature === 'orchestrator-internal-call') {
        isInternalCall = true;
        console.log('Processing internal cron call');
      }
    }

    if (!userId && !isInternalCall) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { actionIds } = await req.json().catch(() => ({ actionIds: null }));

    // Fetch actions to process
    let query = supabase
      .from('cloud_actions')
      .select('*')
      .in('status', ['scheduled', 'running'])
      .lt('attempt_count', 3); // Max 3 attempts

    if (userId) {
      query = query.eq('user_id', userId);
    }

    if (actionIds && Array.isArray(actionIds)) {
      query = query.in('id', actionIds);
    }

    const { data: actions, error } = await query.limit(10);

    if (error) {
      console.error('Error fetching actions:', error);
      throw error;
    }

    console.log(`Found ${actions?.length || 0} actions to process`);

    // Start background processing
    if (actions && actions.length > 0) {
      EdgeRuntime.waitUntil(processActionsInBackground(actions, supabase));
    }

    return new Response(JSON.stringify({ 
      message: 'Processing started', 
      actionsCount: actions?.length || 0 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in cloud actions v2:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function processActionsInBackground(actions: CloudAction[], supabase: any) {
  console.log(`🔄 Background processing started for ${actions.length} actions`);
  
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  // Track start time for timeout management
  const startTime = Date.now();
  const MAX_EXECUTION_TIME = 90000; // 90 seconds safety margin

  for (const action of actions) {
    // Check if we're approaching timeout
    if (Date.now() - startTime > MAX_EXECUTION_TIME) {
      console.log('⏰ Approaching timeout, handing off remaining actions');
      break;
    }

    try {
      processed++;
      console.log(`Processing action ${action.id} (${action.action_type})`);

      // Update status to running and heartbeat
      await supabase
        .from('cloud_actions') 
        .update({
          status: 'running',
          last_heartbeat: new Date().toISOString(),
          started_at: action.started_at || new Date().toISOString()
        })
        .eq('id', action.id);

      // Log processing start
      await supabase.from('cloud_action_logs').insert({
        action_id: action.id,
        user_id: action.user_id,
        level: 'info',
        message: `Started processing ${action.action_type} action - Step: ${action.current_step || 'initial'}`
      });

      // Process single step
      const result = await processSingleStep(action, supabase);

      if (result.completed) {
        // Action completed successfully
        await supabase
          .from('cloud_actions')
          .update({
            status: 'succeeded',
            completed_at: new Date().toISOString(),
            current_step: 'completed',
            last_heartbeat: new Date().toISOString()
          })
          .eq('id', action.id);

        await supabase.from('cloud_action_logs').insert({
          action_id: action.id,
          user_id: action.user_id,
          level: 'info',
          message: `✅ Action completed successfully`
        });

        succeeded++;
      } else if (result.error) {
        // Step failed
        const newAttemptCount = (action.attempt_count || 0) + 1;
        const maxAttempts = 3;

        if (newAttemptCount >= maxAttempts) {
          // Max attempts reached, mark as failed
          await supabase
            .from('cloud_actions')
            .update({
              status: 'failed',
              error_message: result.error,
              completed_at: new Date().toISOString(),
              attempt_count: newAttemptCount,
              last_heartbeat: new Date().toISOString()
            })
            .eq('id', action.id);

          await supabase.from('cloud_action_logs').insert({
            action_id: action.id,
            user_id: action.user_id,
            level: 'error',
            message: `❌ Action failed after ${maxAttempts} attempts: ${result.error}`
          });

          failed++;
        } else {
          // Schedule for retry
          await supabase
            .from('cloud_actions')
            .update({
              status: 'scheduled',
              error_message: result.error,
              attempt_count: newAttemptCount,
              scheduled_for: new Date(Date.now() + (newAttemptCount * 60000)).toISOString(), // Exponential backoff
              last_heartbeat: new Date().toISOString()
            })
            .eq('id', action.id);

          await supabase.from('cloud_action_logs').insert({
            action_id: action.id,
            user_id: action.user_id,
            level: 'warn',
            message: `⚠️ Step failed, scheduling retry ${newAttemptCount}/${maxAttempts}: ${result.error}`
          });
        }
      } else {
        // Step completed, continue in next cycle
        await supabase
          .from('cloud_actions')
          .update({
            current_step: result.nextStep,
            step_data: result.stepData,
            package_id: result.packageId || action.package_id,
            backup_id: result.backupId || action.backup_id,
            last_heartbeat: new Date().toISOString()
          })
          .eq('id', action.id);

        await supabase.from('cloud_action_logs').insert({
          action_id: action.id,
          user_id: action.user_id,
          level: 'info',
          message: `Step '${action.current_step || 'initial'}' completed → '${result.nextStep}'`
        });
      }

    } catch (error) {
      console.error(`Error processing action ${action.id}:`, error);
      
      const newAttemptCount = (action.attempt_count || 0) + 1;
      await supabase
        .from('cloud_actions')
        .update({
          status: newAttemptCount >= 3 ? 'failed' : 'scheduled',
          error_message: error.message,
          attempt_count: newAttemptCount,
          scheduled_for: newAttemptCount < 3 ? new Date(Date.now() + (newAttemptCount * 60000)).toISOString() : undefined,
          completed_at: newAttemptCount >= 3 ? new Date().toISOString() : undefined,
          last_heartbeat: new Date().toISOString()
        })
        .eq('id', action.id);

      await supabase.from('cloud_action_logs').insert({
        action_id: action.id,
        user_id: action.user_id,
        level: 'error',
        message: `💥 Processing error: ${error.message}`
      });

      if (newAttemptCount >= 3) failed++;
    }
  }

  console.log(`🏁 Background processing completed: ${processed} processed, ${succeeded} succeeded, ${failed} failed`);
}

async function processSingleStep(action: CloudAction, supabase: any): Promise<{
  completed?: boolean;
  nextStep?: string;
  stepData?: any;
  packageId?: string;
  backupId?: string;
  error?: string;
}> {
  // Call the cloud-action-steps function to process the step
  const { data, error } = await supabase.functions.invoke('cloud-action-steps', {
    body: {
      action: action,
      step: action.current_step || getInitialStep(action.action_type)
    }
  });

  if (error) {
    throw new Error(`Step processing failed: ${error.message}`);
  }

  return data;
}

function getInitialStep(actionType: string): string {
  switch (actionType) {
    case 'start':
      return 'call_start';
    case 'stop':
      return 'call_stop';
    case 'restart':
      return 'call_stop';
    case 'deploy':
      return 'create_package';
    case 'transport':
      return 'retrieve_source_package';
    default:
      throw new Error(`Unknown action type: ${actionType}`);
  }
}