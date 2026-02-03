

# Database Cleanup Plan

## Problem Summary
Your Supabase database is using 1 GB, with 97% consumed by two system tables:
- **`cron.job_run_details`**: 602 MB - Contains 575,000+ historical cron job run records dating back to September 2025
- **`net._http_response`**: 395 MB - HTTP response cache from pg_net extension

## Root Cause
You have 3 cron jobs running **every minute**, generating ~4,320 records per day:
- `cloud-action-orchestrator-v2` - 196,046 historical runs
- `process-log-monitoring-every-minute` - 191,322 historical runs
- `process-owasp-async-jobs` - 175,489 historical runs

## Solution

### Step 1: One-Time Cleanup (Run in Supabase SQL Editor)

Execute these SQL commands to clear historical data:

```sql
-- Clear all cron job run history (keeps job definitions)
TRUNCATE cron.job_run_details;

-- Clear HTTP response cache
TRUNCATE net._http_response;

-- Reclaim disk space (optional but recommended)
VACUUM FULL cron.job_run_details;
VACUUM FULL net._http_response;
```

**Expected result**: Free up ~997 MB of space immediately

### Step 2: Automatic Cleanup (Prevent Future Buildup)

Create a daily cleanup cron job that keeps only the last 7 days of history:

```sql
-- Create cleanup cron job (runs daily at 3 AM)
SELECT cron.schedule(
  'cleanup-cron-history',
  '0 3 * * *',
  $$
    DELETE FROM cron.job_run_details 
    WHERE end_time < NOW() - INTERVAL '7 days';
    
    DELETE FROM net._http_response 
    WHERE created < NOW() - INTERVAL '1 day';
  $$
);
```

This will automatically prune old records daily, keeping the database lean.

## Technical Details

| Table | Current Size | After Cleanup | Retention |
|-------|-------------|---------------|-----------|
| `cron.job_run_details` | 602 MB | ~5 MB | Last 7 days |
| `net._http_response` | 395 MB | ~1 MB | Last 1 day |
| **Total Savings** | **997 MB** | - | - |

## Alternative: Reduce Cron Frequency

If you want to further reduce database growth, consider:
- Change `process-log-monitoring-every-minute` to every 5 minutes
- Change `process-owasp-async-jobs` to every 5 minutes

This would reduce cron history by 80% going forward.

## Execution Steps

1. **Go to Supabase Dashboard** > SQL Editor
2. **Run the cleanup commands** from Step 1
3. **Run the auto-cleanup cron job** from Step 2
4. Verify space is reclaimed in Database settings

