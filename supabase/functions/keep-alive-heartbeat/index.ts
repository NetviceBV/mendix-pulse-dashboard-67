import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// System UUID for all heartbeat records
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Keep-alive heartbeat function invoked');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get current heartbeat counter
    const { data: latestHeartbeat } = await supabase
      .from('system_heartbeat')
      .select('heartbeat_counter')
      .eq('user_id', SYSTEM_USER_ID)
      .eq('heartbeat_type', 'keep_alive')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextCounter = (latestHeartbeat?.heartbeat_counter || 0) + 1;

    // Insert new heartbeat record
    const { error: insertError } = await supabase
      .from('system_heartbeat')
      .insert({
        user_id: SYSTEM_USER_ID,
        heartbeat_type: 'keep_alive',
        heartbeat_counter: nextCounter,
      });

    if (insertError) {
      console.error('Error inserting heartbeat:', insertError);
      throw insertError;
    }

    console.log(`Heartbeat inserted successfully (counter: ${nextCounter})`);

    // Clean up old heartbeat records (keep only last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { error: deleteError } = await supabase
      .from('system_heartbeat')
      .delete()
      .eq('user_id', SYSTEM_USER_ID)
      .eq('heartbeat_type', 'keep_alive')
      .lt('created_at', thirtyDaysAgo.toISOString());

    if (deleteError) {
      console.error('Error cleaning up old heartbeats:', deleteError);
      // Don't throw - cleanup is not critical
    } else {
      console.log('Old heartbeat records cleaned up successfully');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        counter: nextCounter,
        message: 'Heartbeat recorded successfully' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('Error in keep-alive-heartbeat function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
