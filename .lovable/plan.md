

## Fix: Linting Results Not Displaying

### Problem

The linting check completes successfully (14,276 passed, 2,021 failed, 26 rules stored in database), but results never appear in the UI.

**Root cause**: There is a mismatch between identifiers:
- The edge function stores results with `app_id = project_id` (UUID like `73fcfab5-e311-4eb5-8174-537f1b89edd0`)
- The frontend calls `useLintingQuery(app.app_id)` where `app.app_id` is the Mendix app name (like `prikklbackoffice`)
- The query filters `WHERE app_id = 'prikklbackoffice'` but the database has `app_id = '73fcfab5-...'`, so zero results are returned

### Fix

Change the frontend to use `app.project_id` instead of `app.app_id` for all linting-related queries and cache keys. This matches what the edge function stores.

### Technical Changes

**`src/components/AppCard.tsx`**

Three changes:
1. Line 141: Change `useLintingQuery(app.app_id)` to `useLintingQuery(app.project_id)`
2. Line 649: Change `queryClient.invalidateQueries({ queryKey: ['linting', app.app_id] })` to use `app.project_id`
3. Line 650: Change `queryClient.invalidateQueries({ queryKey: ['linting-runs', app.app_id] })` to use `app.project_id`

Also check any other linting-related references passing `app.app_id` (e.g., LintingRunHistory) and update them to `app.project_id`.

No edge function or database changes needed -- the stored data is already correct.
