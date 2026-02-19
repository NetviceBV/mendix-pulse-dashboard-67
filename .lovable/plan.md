

## Fix Git/SVN Routing by Fetching Real Version Before Linting

### Problem
Every app has `version: '1.0.0'` hardcoded in `fetch-mendix-apps` (line 129), so the `hasGitHash()` check in `run-linting-checks` always picks SVN. The real version info (`modelVersion`) is already fetched for environments but never written back to the app's `version` column.

### Solution
Add a lightweight version-refresh step inside `run-linting-checks` before the Git/SVN routing decision. This calls the Mendix API for the specific app's environments to get the real `modelVersion`.

### Changes

**1. `supabase/functions/run-linting-checks/index.ts`**

After fetching the credential and before the Git/SVN routing logic, add a step that:
- Calls the Mendix V4 API: `GET /api/v4/apps/{appId}/environments` using the credential's PAT
- Picks the first environment's `modelVersion` (e.g. `10.21.0.12345.abcdef1`)
- Updates the `mendix_apps.version` column for that app with the real version
- Uses this fresh version for the `hasGitHash()` check instead of the stale DB value

This is a targeted, lightweight call (one HTTP request) rather than re-running the full fetch-all-apps flow.

```text
Existing flow:
  1. Authenticate user
  2. Fetch credential
  3. Read app version from DB  <-- always '1.0.0'
  4. hasGitHash() decides routing
  5. Call analyzer

New flow:
  1. Authenticate user
  2. Fetch credential
  3. Read app version from DB
  4. [NEW] If version looks stale ('1.0.0' or missing):
     a. Call Mendix API for environment details
     b. Extract modelVersion from first environment
     c. Update mendix_apps.version in DB
     d. Use fresh version for routing
  5. hasGitHash() decides routing
  6. Call analyzer
```

**2. `supabase/functions/fetch-mendix-apps/index.ts`**

Also fix the root cause: after upserting environments, update each app's `version` column with the `modelVersion` from its first environment (e.g. Production). This prevents future staleness.

- After the environment upsert loop, build a map of `app_id -> modelVersion` from the environment results
- Update `mendix_apps.version` for each app that has a known `modelVersion`

### Technical Details

Version refresh snippet for `run-linting-checks`:
```typescript
// After fetching appRow, refresh version if it looks like the default
let appVersion = appRow?.version;
if (!appVersion || appVersion === '1.0.0') {
  try {
    const envHeaders: Record<string, string> = {};
    if (credential.pat) {
      envHeaders['Authorization'] = `MxToken ${credential.pat}`;
    }
    const envRes = await fetch(
      `https://cloud.home.mendix.com/api/v4/apps/${appId}/environments`,
      { headers: envHeaders }
    );
    if (envRes.ok) {
      const envData = await envRes.json();
      const envs = envData.Environments || envData.environments || [];
      const firstModel = envs.find((e: any) => e.modelVersion)?.modelVersion;
      if (firstModel) {
        appVersion = firstModel;
        // Persist so future runs don't need this call
        await supabase
          .from('mendix_apps')
          .update({ version: firstModel })
          .eq('project_id', appId)
          .eq('user_id', user.id);
        console.log(`Refreshed app version to: ${firstModel}`);
      }
    }
  } catch (e) {
    console.log(`Version refresh failed, proceeding with existing: ${e}`);
  }
}
```

For `fetch-mendix-apps`, after the environment upsert succeeds, update app versions:
```typescript
// Build version map from environment modelVersions
const appVersionMap = new Map<string, string>();
for (const env of validatedResults) {
  if (env.model_version && !appVersionMap.has(env.app_id)) {
    appVersionMap.set(env.app_id, env.model_version);
  }
}
// Update app versions
for (const [appId, version] of appVersionMap) {
  await supabase
    .from('mendix_apps')
    .update({ version })
    .eq('project_id', appId)
    .eq('user_id', user.id);
}
```

### What stays the same
- The `hasGitHash()` detection logic (it works correctly when given a real version string)
- The Git-first/SVN-fallback strategy
- The webhook callback architecture
- All other edge functions

