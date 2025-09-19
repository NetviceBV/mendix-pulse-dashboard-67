-- Remove the specific legacy V1 cron job that's still running
-- This targets Job ID 2 which is calling the deleted run-cloud-actions function
SELECT cron.unschedule(2);

-- Also ensure any other legacy jobs are cleaned up
-- Check for any remaining jobs that might reference old functions
DO $$
DECLARE
    job_record RECORD;
BEGIN
    -- Log current cron jobs for debugging
    RAISE NOTICE 'Current cron jobs before cleanup:';
    FOR job_record IN 
        SELECT jobid, jobname, command 
        FROM cron.job 
        WHERE command LIKE '%run-cloud-actions%' 
           OR command LIKE '%cleanup-stale-actions%'
    LOOP
        RAISE NOTICE 'Job ID: %, Name: %, Command: %', job_record.jobid, job_record.jobname, job_record.command;
        -- Unschedule any legacy jobs
        PERFORM cron.unschedule(job_record.jobid);
        RAISE NOTICE 'Unscheduled job ID: %', job_record.jobid;
    END LOOP;
    
    -- Log remaining cron jobs after cleanup
    RAISE NOTICE 'Remaining cron jobs after cleanup:';
    FOR job_record IN SELECT jobid, jobname, command FROM cron.job LOOP
        RAISE NOTICE 'Job ID: %, Name: %, Command: %', job_record.jobid, job_record.jobname, job_record.command;
    END LOOP;
END $$;