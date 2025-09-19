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

    console.log('🧹 Cleaning up stale V1 cloud actions...');

    // Find stale V1 actions (running status but no last_heartbeat and older than 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const { data: staleActions, error: fetchError } = await supabase
      .from('cloud_actions')
      .select('id, action_type, created_at')
      .eq('status', 'running')
      .is('last_heartbeat', null)
      .lt('created_at', oneHourAgo);

    if (fetchError) {
      console.error('Error fetching stale actions:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${staleActions?.length || 0} stale V1 actions to clean up`);

    if (staleActions && staleActions.length > 0) {
      // Update stale actions to failed status
      const { data: updatedActions, error: updateError } = await supabase
        .from('cloud_actions')
        .update({
          status: 'failed',
          error_message: 'Cleaned up stale V1 action during V2 migration',
          updated_at: new Date().toISOString(),
          completed_at: new Date().toISOString()
        })
        .in('id', staleActions.map(a => a.id))
        .select();

      if (updateError) {
        console.error('Error updating stale actions:', updateError);
        throw updateError;
      }

      console.log(`✅ Successfully cleaned up ${updatedActions?.length || 0} stale V1 actions`);
      
      return new Response(JSON.stringify({
        message: 'Cleanup completed successfully',
        cleanedActions: updatedActions?.length || 0,
        actionIds: staleActions.map(a => a.id)
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      message: 'No stale actions found to clean up',
      cleanedActions: 0
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in cleanup function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});