

## Plan: Add Retention Policy for mendix_logs Table

### Problem Summary
The `mendix_logs` table (used for webhook log ingestion) has no automatic cleanup mechanism, while `cloud_action_logs` is cleaned up after 30 days. This could lead to indefinite database growth.

### Current State

| Table | Cleanup Mechanism | Retention Period |
|-------|-------------------|------------------|
| `cloud_action_logs` | `cloud-action-orchestrator` edge function | 30 days |
| `mendix_logs` | None | Indefinite growth |
| `cron.job_run_details` | `cleanup-cron-history` pg_cron job | 2 days |
| `net._http_response` | `cleanup-cron-history` pg_cron job | 1 day |

### Solution Options

**Option A: Extend existing `cleanup-cron-history` cron job (Recommended)**
- Add `mendix_logs` cleanup to the existing 3 AM daily job
- More efficient (pure SQL, no edge function invocation)
- Consolidates all maintenance in one place

**Option B: Add cleanup to `cloud-action-orchestrator` edge function**
- Adds another DELETE operation to the every-minute orchestrator
- Less efficient (runs via edge function 1440 times/day vs once)

### Recommended Implementation (Option A)

Update the existing `cleanup-cron-history` cron job to include `mendix_logs` cleanup:

**Current job command:**
```sql
DELETE FROM cron.job_run_details 
WHERE end_time < NOW() - INTERVAL '2 days';

DELETE FROM net._http_response 
WHERE created < NOW() - INTERVAL '1 day';
```

**Updated job command:**
```sql
DELETE FROM cron.job_run_details 
WHERE end_time < NOW() - INTERVAL '2 days';

DELETE FROM net._http_response 
WHERE created < NOW() - INTERVAL '1 day';

DELETE FROM public.mendix_logs 
WHERE created_at < NOW() - INTERVAL '30 days';
```

### Retention Period Choice
- **30 days** matches `cloud_action_logs` retention
- Provides sufficient history for debugging and analysis
- Can be adjusted based on usage patterns

### Implementation Steps

| Step | Action | Method |
|------|--------|--------|
| 1 | Update `cleanup-cron-history` cron job | SQL via insert tool |
| 2 | Document in KNOWLEDGE.md | Code edit |
| 3 | Add index for efficient cleanup (optional) | Migration |

### SQL to Execute

```sql
-- Update the existing cleanup-cron-history job
SELECT cron.alter_job(
  job_id := 12,
  schedule := '0 3 * * *',
  command := $$
    DELETE FROM cron.job_run_details 
    WHERE end_time < NOW() - INTERVAL '2 days';
    
    DELETE FROM net._http_response 
    WHERE created < NOW() - INTERVAL '1 day';
    
    DELETE FROM public.mendix_logs 
    WHERE created_at < NOW() - INTERVAL '30 days';
  $$
);
```

### Optional Performance Enhancement

For large tables, add an index to optimize the cleanup query:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mendix_logs_created_at 
ON public.mendix_logs (created_at);
```

### Documentation Update

Add to KNOWLEDGE.md under "Database Extension Security Notes" or create new "Data Retention Policies" section:

```markdown
### Data Retention Policies

| Table | Retention Period | Cleanup Method |
|-------|------------------|----------------|
| `mendix_logs` | 30 days | Daily pg_cron job (3 AM) |
| `cloud_action_logs` | 30 days | cloud-action-orchestrator |
| `cloud_actions` (completed/failed) | 7 days | cloud-action-orchestrator |
| `cron.job_run_details` | 2 days | Daily pg_cron job (3 AM) |
| `net._http_response` | 1 day | Daily pg_cron job (3 AM) |
```

### Benefits

1. **Prevents unbounded growth**: Logs older than 30 days are automatically removed
2. **Efficient execution**: Runs once daily at low-traffic time (3 AM)
3. **Consistent with existing patterns**: Uses same retention period as `cloud_action_logs`
4. **Centralized maintenance**: All cleanup operations in one cron job

