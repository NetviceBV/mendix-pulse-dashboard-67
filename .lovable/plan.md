

## Force Deployment of run-linting-checks with a Visible Code Change

### Problem
The version-refresh logic has been in the source code for multiple deployment cycles, but the deployed edge function is **still running old code**. Every log entry shows `App version: 1.0.0` with no refresh attempt — meaning the deployment tool is either silently failing or caching a previous build.

### Solution
Make a small but meaningful change to the edge function source to force a completely fresh deployment. This also improves the logging so we can clearly tell which version of the code is running.

### Changes

**`supabase/functions/run-linting-checks/index.ts`**

1. Add a startup/version banner log at the top of the request handler (right after the OPTIONS check):
   ```typescript
   console.log('[run-linting-checks] v2 - with version refresh')
   ```
   This way, we can immediately tell from logs whether the new code is deployed.

2. Add more defensive logging around the version refresh block:
   ```typescript
   console.log(`DB version for app ${appId}: ${appRow?.version ?? 'null'}, will refresh: ${!appVersion || appVersion === '1.0.0'}`)
   ```

3. Redeploy `run-linting-checks` after the change.

### Expected Outcome
After deployment, the logs should show:
- `[run-linting-checks] v2 - with version refresh` (confirms new code is running)
- `DB version for app ...: 1.0.0, will refresh: true`
- Either `Refreshed app version to: <real version>` or an error explaining why the refresh failed

### If Deployment Still Fails
If even after this change the logs don't show the "v2" banner, the issue is at the deployment infrastructure level and we'll need to investigate the Supabase deployment pipeline further (e.g., checking if there's a build cache or deployment error we're not seeing).
