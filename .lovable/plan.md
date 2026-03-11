

## Fix Git/SVN Detection Using Commits API `mendixVersion`

### Problem
The environment API never returns `modelVersion`, so the version stays `1.0.0` and every app routes to SVN. We need a reliable source for the Mendix version.

### Solution
Use the Repository API commits endpoint (`/v1/repositories/{appId}/branches/{branchName}/commits?limit=1`) which returns `mendixVersion` per commit (e.g., `"8.18.5.18651"` or `"10.21.0.xxxxx"`). Fetch the latest commit from the mainline branch, extract the major version, and route accordingly.

### Changes

**`supabase/functions/run-linting-checks/index.ts`**

Replace the version refresh block (lines 83-113) and `getMajorVersion` function with:

1. **Try to get `mendixVersion` from the latest mainline commit** (requires PAT):
   - Try branch name `main` first (MX10+ convention)
   - If that returns 404, try `trunk` (MX9 convention)
   - Take `mendixVersion` from the first (latest) commit
   - Update `mendix_apps.version` in the DB with the real version

2. **Parse the major version** from the `mendixVersion` string and route:
   - Major >= 10 --> GIT
   - Major < 10 --> SVN

### Pseudocode

```text
if (!appVersion || appVersion === '1.0.0') AND credential.pat:
  for branchName in ['main', 'trunk']:
    GET /v1/repositories/{appId}/branches/{branchName}/commits?limit=1
    if 200:
      mendixVersion = items[0].mendixVersion   // e.g. "10.21.0.12345"
      update mendix_apps.version = mendixVersion
      break
    if 404:
      try next branch name

parse major version from appVersion
major >= 10 -> GIT endpoint
major < 10  -> SVN endpoint
```

### Code Detail

The version refresh block becomes:

```typescript
// Refresh version from Repository API commits (mendixVersion field)
if ((!appVersion || appVersion === '1.0.0') && credential.pat) {
  console.log('Version is stale, fetching mendixVersion from latest mainline commit...')
  const branchNames = ['main', 'trunk']
  for (const branch of branchNames) {
    try {
      const commitUrl = `https://repository.api.mendix.com/v1/repositories/${appId}/branches/${encodeURIComponent(branch)}/commits?limit=1`
      const commitRes = await fetch(commitUrl, {
        headers: { 'Authorization': `MxToken ${credential.pat}`, 'Accept': 'application/json' }
      })
      if (commitRes.ok) {
        const commitData = await commitRes.json()
        const items = commitData.items || []
        if (items.length > 0 && items[0].mendixVersion) {
          appVersion = items[0].mendixVersion
          await supabase
            .from('mendix_apps')
            .update({ version: appVersion })
            .eq('project_id', appId)
            .eq('user_id', user.id)
          console.log(`Got mendixVersion from branch '${branch}': ${appVersion}`)
          break
        }
      } else {
        console.log(`Commits API for branch '${branch}' returned ${commitRes.status}, trying next...`)
      }
    } catch (e) {
      console.log(`Commits fetch for branch '${branch}' failed: ${e}`)
    }
  }
}
```

The `getMajorVersion` function and the routing logic after it stay exactly the same:

```typescript
function getMajorVersion(ver?: string): number {
  if (!ver) return 0
  const match = ver.match(/^(\d+)\./)
  return match ? parseInt(match[1], 10) : 0
}

const majorVersion = getMajorVersion(appVersion)
const useGit = majorVersion >= 10
console.log(`App version: ${appVersion ?? 'unknown'}, major: ${majorVersion}, routing: ${useGit ? 'GIT' : 'SVN'}`)
```

### What Changes
- Version refresh block (lines 83-113): replaced with Repository API commits call
- Everything else stays identical

### What Gets Removed
- The environment API call to `cloud.home.mendix.com` (never returned modelVersion)

### What Stays
- `getMajorVersion()` function
- Major version routing logic (>= 10 = GIT, < 10 = SVN)
- All authentication, policy collection, webhook, Railway ping code

### Expected Logs After Deployment
For Prikkl Backoffice (Mendix 10+):
```
Version is stale, fetching mendixVersion from latest mainline commit...
Got mendixVersion from branch 'main': 10.21.0.12345
App version: 10.21.0.12345, major: 10, routing: GIT
Using GIT endpoint...
```

For a Mendix 9 app:
```
Version is stale, fetching mendixVersion from latest mainline commit...
Commits API for branch 'main' returned 404, trying next...
Got mendixVersion from branch 'trunk': 9.24.1.54321
App version: 9.24.1.54321, major: 9, routing: SVN
Using SVN endpoint...
```
