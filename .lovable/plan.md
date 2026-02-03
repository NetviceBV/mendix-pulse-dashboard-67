

## Plan: Add Database Indexes for Query Optimization

### Problem Summary
Two heavily-queried tables lack indexes, causing full table scans on every query:
- **`mendix_logs`**: Queried frequently for error counts, log viewing, and real-time monitoring
- **`cloud_actions`**: Queried every minute by the orchestrator cron job and by the UI

### Query Patterns Identified

**`mendix_logs` table queries:**
| Location | Query Pattern | Needs Index |
|----------|--------------|-------------|
| `AppCard.tsx` | `app_id` + `level` (error counting) | `(app_id, level)` |
| `useMendixOperations.ts` | `app_id` + `environment` (log filtering) | `(app_id, environment)` |
| `useMendixOperations.ts` | `ORDER BY timestamp DESC` | `(timestamp DESC)` |

**`cloud_actions` table queries:**
| Location | Query Pattern | Needs Index |
|----------|--------------|-------------|
| `cloud-action-orchestrator` | `status = 'scheduled'` + `scheduled_for` | `(status, scheduled_for)` |
| `cloud-action-orchestrator` | `status = 'running'` + `last_heartbeat` | `(status, last_heartbeat)` |
| `run-cloud-actions-v2` | `user_id` + `status` | `(user_id, status)` |
| `CloudActions.tsx` | `ORDER BY created_at DESC` | `(created_at DESC)` |

### Solution: Create Database Migration

Create a new migration file that adds the following indexes:

```sql
-- ================================================
-- Performance Indexes for mendix_logs table
-- ================================================

-- Index for filtering logs by app and environment (used in LogsViewer)
CREATE INDEX IF NOT EXISTS idx_mendix_logs_app_env 
ON public.mendix_logs (app_id, environment);

-- Index for error/warning counting (used in AppCard for badges)
CREATE INDEX IF NOT EXISTS idx_mendix_logs_app_level 
ON public.mendix_logs (app_id, level);

-- Index for timestamp ordering (used in all log queries)
CREATE INDEX IF NOT EXISTS idx_mendix_logs_timestamp 
ON public.mendix_logs (timestamp DESC);

-- Composite index for the most common query pattern
CREATE INDEX IF NOT EXISTS idx_mendix_logs_app_env_timestamp 
ON public.mendix_logs (app_id, environment, timestamp DESC);

-- ================================================
-- Performance Indexes for cloud_actions table
-- ================================================

-- Partial index for scheduled actions (used by orchestrator every minute)
-- Partial index is smaller and faster since it only includes scheduled rows
CREATE INDEX IF NOT EXISTS idx_cloud_actions_scheduled 
ON public.cloud_actions (scheduled_for) 
WHERE status = 'scheduled';

-- Partial index for running actions with heartbeat (stale detection)
CREATE INDEX IF NOT EXISTS idx_cloud_actions_running_heartbeat 
ON public.cloud_actions (last_heartbeat) 
WHERE status = 'running';

-- Index for user-specific queries
CREATE INDEX IF NOT EXISTS idx_cloud_actions_user_status 
ON public.cloud_actions (user_id, status);

-- Index for UI ordering
CREATE INDEX IF NOT EXISTS idx_cloud_actions_created_at 
ON public.cloud_actions (created_at DESC);
```

### Technical Details

| Table | Index | Type | Purpose |
|-------|-------|------|---------|
| `mendix_logs` | `idx_mendix_logs_app_env` | B-tree | Filter by app + environment |
| `mendix_logs` | `idx_mendix_logs_app_level` | B-tree | Count errors/warnings |
| `mendix_logs` | `idx_mendix_logs_timestamp` | B-tree (DESC) | Order by time |
| `mendix_logs` | `idx_mendix_logs_app_env_timestamp` | B-tree composite | Combined filter + order |
| `cloud_actions` | `idx_cloud_actions_scheduled` | Partial B-tree | Orchestrator scheduled scan |
| `cloud_actions` | `idx_cloud_actions_running_heartbeat` | Partial B-tree | Stale action detection |
| `cloud_actions` | `idx_cloud_actions_user_status` | B-tree | User dashboard queries |
| `cloud_actions` | `idx_cloud_actions_created_at` | B-tree (DESC) | UI list ordering |

### Why Partial Indexes?
For `cloud_actions`, using **partial indexes** (with `WHERE status = 'scheduled'` or `WHERE status = 'running'`) is more efficient because:
- Only a small fraction of rows have these statuses at any time
- The index is smaller and faster to scan
- Reduces storage overhead

### Expected Impact
- **Orchestrator cron job**: Faster execution every minute (currently scanning full table)
- **Log queries**: Faster filtering and counting operations
- **UI responsiveness**: Faster dashboard and log viewer loading
- **Database CPU**: Reduced load from eliminated full table scans

### Implementation Steps
1. Create a new Supabase migration with the index creation SQL
2. The migration will run automatically on deployment
3. Indexes are created with `IF NOT EXISTS` for safety

