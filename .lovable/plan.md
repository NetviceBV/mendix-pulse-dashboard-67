

## Plan: Deduplicate Mendix Apps Across Credentials

### Problem
You have 60 app rows but only 31 unique projects. When two credentials share access to the same Mendix projects, each "Fetch Apps" call creates a separate row per credential, causing duplicates on the dashboard.

### Solution

#### 1. Change the upsert conflict key in `fetch-mendix-apps` edge function

Currently: `onConflict: 'app_id,credential_id'` -- allows same app from different credentials.

Change to: `onConflict: 'project_id,user_id'` -- ensures one row per app per user, regardless of which credential fetched it.

This requires:
- Adding a unique constraint on `(project_id, user_id)` to `mendix_apps`
- Updating the upsert call in the edge function

The `credential_id` column will store whichever credential last fetched the app (acceptable since the app data itself is identical).

#### 2. Do the same for environments

The environments table has `onConflict: 'environment_id,credential_id,user_id'`. Change to `onConflict: 'environment_id,user_id'` with a matching unique constraint, so environments are also deduplicated across credentials.

#### 3. Clean up existing duplicates (database migration)

Delete duplicate rows, keeping the most recently updated one per `project_id`:

```sql
-- Delete duplicate apps, keep newest per project_id + user_id
DELETE FROM mendix_apps a
USING mendix_apps b
WHERE a.project_id = b.project_id
  AND a.user_id = b.user_id
  AND a.updated_at < b.updated_at;

-- Same for environments
DELETE FROM mendix_environments a
USING mendix_environments b
WHERE a.environment_id = b.environment_id
  AND a.user_id = b.user_id
  AND a.updated_at < b.updated_at;
```

Then add the unique constraints.

#### 4. No dashboard changes needed

The `useAppsQuery` hook fetches all apps -- once duplicates are gone and the constraint prevents new ones, the dashboard automatically shows unique apps only.

### Files to Modify

| File | Change |
|------|--------|
| Database migration | Clean duplicates, add unique constraints on `(project_id, user_id)` and `(environment_id, user_id)` |
| `supabase/functions/fetch-mendix-apps/index.ts` | Change upsert `onConflict` for apps to `project_id,user_id` and for environments to `environment_id,user_id` |

### Risk Assessment

- **Low risk**: The duplicate rows contain identical app data (same project, same name). Keeping the newest ensures latest status.
- **Foreign keys**: `linting_results`, `owasp_checks`, etc. reference `app_id` (the text project ID), not the `mendix_apps.id` UUID, so deleting duplicate rows won't break references.

