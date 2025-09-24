import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    console.log('🎯 Cloud Action Orchestrator - Cron Cycle Started');

    // Find actions that need processing
    const now = new Date().toISOString();
    const staleThreshold = new Date(Date.now() - 45 * 1000).toISOString(); // 45 seconds ago

    // Get scheduled actions ready to run
    const { data: scheduledActions, error: scheduledError } = await supabase
      .from('cloud_actions')
      .select('*')
      .eq('status', 'scheduled')
      .or(`scheduled_for.is.null,scheduled_for.lte.${now}`)
      .lt('attempt_count', 3)
      .order('created_at', { ascending: true })
      .limit(10);

    if (scheduledError) {
      console.error('Error fetching scheduled actions:', scheduledError);
      throw scheduledError;
    }

    // Get stale running actions (v1 actions may not have last_heartbeat)
    const { data: staleActions, error: staleError } = await supabase
      .from('cloud_actions')
      .select('*')
      .eq('status', 'running')
      .or(`last_heartbeat.is.null,last_heartbeat.lt.${staleThreshold}`)
      .lt('attempt_count', 3)
      .order('created_at', { ascending: true })
      .limit(10);

    if (staleError) {
      console.error('Error fetching stale actions:', staleError);
      throw staleError;
    }

    // Combine both arrays
    const actionsToProcess = [...(scheduledActions || []), ...(staleActions || [])];


    console.log(`Found ${actionsToProcess?.length || 0} actions to process`);

    if (!actionsToProcess || actionsToProcess.length === 0) {
      return new Response(JSON.stringify({ 
        message: 'No actions to process',
        timestamp: now
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Log stale actions that are being resumed (including V1 actions without heartbeat)
    const resumedActions = actionsToProcess.filter(action => 
      action.status === 'running' && 
      (!action.last_heartbeat || new Date(action.last_heartbeat) < new Date(staleThreshold))
    );

    for (const resumedAction of resumedActions) {
      const isV1Action = !resumedAction.last_heartbeat;
      const logMessage = isV1Action 
        ? `🔄 Resuming V1 action with V2 orchestrator from step: ${resumedAction.current_step || 'initial'}`
        : `🔄 Resuming stale action from step: ${resumedAction.current_step || 'initial'}`;
        
      await supabase.from('cloud_action_logs').insert({
        action_id: resumedAction.id,
        user_id: resumedAction.user_id,
        level: 'info',
        message: logMessage
      });
      
      console.log(`Resuming ${isV1Action ? 'V1' : 'stale'} action ${resumedAction.id} from step: ${resumedAction.current_step}`);
    }

    // Group actions by user to process in batches
    const actionsByUser = actionsToProcess.reduce((acc, action) => {
      if (!acc[action.user_id]) {
        acc[action.user_id] = [];
      }
      acc[action.user_id].push(action);
      return acc;
    }, {} as Record<string, typeof actionsToProcess>);

    console.log(`Processing actions for ${Object.keys(actionsByUser).length} users`);

    // Process each user's actions
    const processingPromises = Object.entries(actionsByUser).map(async ([userId, userActions]) => {
      try {
        console.log(`Processing ${userActions.length} actions for user ${userId}`);
        
        // Call run-cloud-actions-v2 for this user's actions
        const { data, error } = await supabase.functions.invoke('run-cloud-actions-v2', {
          body: {
            actionIds: userActions.map(a => a.id)
          },
          headers: {
            'x-cron-signature': 'orchestrator-internal-call'
          }
        });

        if (error) {
          console.error(`Error processing actions for user ${userId}:`, error);
          
          // Log errors for failed user batch
          for (const action of userActions) {
            await supabase.from('cloud_action_logs').insert({
              action_id: action.id,
              user_id: action.user_id,
              level: 'error',
              message: `Orchestrator processing error: ${error.message}`
            });
          }
        } else {
          console.log(`Successfully triggered processing for user ${userId}: ${data?.message}`);
        }
      } catch (error) {
        console.error(`Exception processing user ${userId}:`, error);
      }
    });

    // Wait for all user batches to complete
    await Promise.allSettled(processingPromises);

    // Clean up old completed/failed actions (older than 7 days)
    const cleanupThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    const { error: cleanupError } = await supabase
      .from('cloud_actions')
      .delete()
      .in('status', ['succeeded', 'failed'])
      .lt('completed_at', cleanupThreshold);

    if (cleanupError) {
      console.error('Error cleaning up old actions:', cleanupError);
    } else {
      console.log('✨ Cleaned up old completed/failed actions');
    }

    // Clean up old logs (older than 30 days)
    const logCleanupThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const { error: logCleanupError } = await supabase
      .from('cloud_action_logs')
      .delete()
      .lt('created_at', logCleanupThreshold);

    if (logCleanupError) {
      console.error('Error cleaning up old logs:', logCleanupError);
    } else {
      console.log('🗑️ Cleaned up old action logs');
    }

    console.log('🎯 Cloud Action Orchestrator - Cron Cycle Completed');

    return new Response(JSON.stringify({ 
      message: 'Orchestration cycle completed',
      processedUsers: Object.keys(actionsByUser).length,
      totalActions: actionsToProcess.length,
      staleActionsResumed: resumedActions.length,
      timestamp: now
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in cloud action orchestrator:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Handle graceful shutdown
addEventListener('beforeunload', (ev) => {
  console.log('Cloud Action Orchestrator shutdown due to:', ev.detail?.reason);
});