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
    const staleThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 minutes ago

    const { data: actionsToProcess, error } = await supabase
      .from('cloud_actions')
      .select('*')
      .or(`
        and(status.eq.scheduled,or(scheduled_for.is.null,scheduled_for.lte.${now})),
        and(status.eq.running,last_heartbeat.lt.${staleThreshold})
      `)
      .lt('attempt_count', 3)
      .order('created_at', { ascending: true })
      .limit(20);

    if (error) {
      console.error('Error fetching actions:', error);
      throw error;
    }

    console.log(`Found ${actionsToProcess?.length || 0} actions to process`);

    if (!actionsToProcess || actionsToProcess.length === 0) {
      return new Response(JSON.stringify({ 
        message: 'No actions to process',
        timestamp: now
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Log stale actions that are being resumed
    const staleActions = actionsToProcess.filter(action => 
      action.status === 'running' && 
      action.last_heartbeat && 
      new Date(action.last_heartbeat) < new Date(staleThreshold)
    );

    for (const staleAction of staleActions) {
      await supabase.from('cloud_action_logs').insert({
        action_id: staleAction.id,
        user_id: staleAction.user_id,
        level: 'info',
        message: `🔄 Resuming stale action from step: ${staleAction.current_step || 'initial'}`
      });
      
      console.log(`Resuming stale action ${staleAction.id} from step: ${staleAction.current_step}`);
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
      staleActionsResumed: staleActions.length,
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