import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { getErrorMessage } from '../_shared/error-utils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[OWASP Cleanup] Starting cleanup of stale jobs...');

    const now = new Date();
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Clean up failed jobs older than 1 week
    const { error: deleteFailedError, count: deletedFailedCount } = await supabase
      .from('owasp_async_jobs')
      .delete({ count: 'exact' })
      .eq('status', 'failed')
      .lt('created_at', oneWeekAgo.toISOString());

    if (deleteFailedError) {
      console.error('[OWASP Cleanup] Error deleting failed jobs:', deleteFailedError);
    } else {
      console.log(`[OWASP Cleanup] Deleted ${deletedFailedCount || 0} failed jobs older than 1 week`);
    }

    // Clean up completed jobs older than 1 week
    const { error: deleteCompletedError, count: deletedCompletedCount } = await supabase
      .from('owasp_async_jobs')
      .delete({ count: 'exact' })
      .eq('status', 'completed')
      .lt('created_at', oneWeekAgo.toISOString());

    if (deleteCompletedError) {
      console.error('[OWASP Cleanup] Error deleting completed jobs:', deleteCompletedError);
    } else {
      console.log(`[OWASP Cleanup] Deleted ${deletedCompletedCount || 0} completed jobs older than 1 week`);
    }

    // Mark stuck processing jobs as failed (no updates for 15 minutes)
    const { data: stuckJobs, error: stuckError } = await supabase
      .from('owasp_async_jobs')
      .select('id, job_type, payload')
      .eq('status', 'processing')
      .lt('updated_at', fifteenMinutesAgo.toISOString());

    if (stuckError) {
      console.error('[OWASP Cleanup] Error fetching stuck jobs:', stuckError);
    } else if (stuckJobs && stuckJobs.length > 0) {
      const { error: updateError } = await supabase
        .from('owasp_async_jobs')
        .update({
          status: 'failed',
          error_message: 'Job timed out - no updates for 15 minutes',
          completed_at: new Date().toISOString(),
        })
        .in('id', stuckJobs.map(j => j.id));

      if (updateError) {
        console.error('[OWASP Cleanup] Error updating stuck jobs:', updateError);
      } else {
        console.log(`[OWASP Cleanup] Marked ${stuckJobs.length} stuck jobs as failed (no updates for 15+ minutes)`);
        stuckJobs.forEach((job: any) => {
          const batchInfo = job.job_type === 'multi-check-batch' 
            ? ` (Batch ${job.payload?.batch_number + 1}/${job.payload?.total_batches})`
            : '';
          console.log(`[OWASP Cleanup] - Job ${job.id} (${job.job_type})${batchInfo}`);
        });
      }
    }

    // Re-queue jobs that failed but haven't reached max attempts and are older than 1 hour
    const { data: retryableJobs, error: retryError } = await supabase
      .from('owasp_async_jobs')
      .select('id, attempts, max_attempts')
      .eq('status', 'failed')
      .lt('attempts', 3) // Max attempts
      .lt('updated_at', oneHourAgo.toISOString());

    if (retryError) {
      console.error('[OWASP Cleanup] Error fetching retryable jobs:', retryError);
    } else if (retryableJobs && retryableJobs.length > 0) {
      const { error: requeueError } = await supabase
        .from('owasp_async_jobs')
        .update({
          status: 'queued',
          error_message: null,
        })
        .in('id', retryableJobs.map(j => j.id));

      if (requeueError) {
        console.error('[OWASP Cleanup] Error re-queuing jobs:', requeueError);
      } else {
        console.log(`[OWASP Cleanup] Re-queued ${retryableJobs.length} failed jobs for retry`);
      }
    }

    const totalCleaned = (deletedFailedCount || 0) + (deletedCompletedCount || 0) + (stuckJobs?.length || 0);
    console.log(`[OWASP Cleanup] Cleanup complete. Total cleaned: ${totalCleaned}`);

    return new Response(
      JSON.stringify({
        message: 'Cleanup complete',
        deleted_failed: deletedFailedCount || 0,
        deleted_completed: deletedCompletedCount || 0,
        marked_stuck: stuckJobs?.length || 0,
        requeued: retryableJobs?.length || 0,
        total_cleaned: totalCleaned,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[OWASP Cleanup] Fatal error:', error);
    return new Response(
      JSON.stringify({ error: getErrorMessage(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
