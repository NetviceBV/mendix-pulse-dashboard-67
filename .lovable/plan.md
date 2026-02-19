

## Simplify Git/SVN Routing: Mendix 9 = SVN, Mendix 10+ = GIT

### Problem
The current routing logic uses `hasGitHash()` regex matching, version refresh API calls, and multiple fallback strategies — all of which have been unreliable and hard to debug. The rule is actually simple:
- Mendix 9.x --> SVN
- Mendix 10+ --> GIT

### Changes

**`supabase/functions/run-linting-checks/index.ts`**

Replace the entire version detection and routing block (lines 72-254) with a simple major-version check:

1. **Remove** the `hasGitHash()` function entirely
2. **Remove** the version refresh API call (lines 83-113) — no longer needed
3. **Remove** the complex `useGitFirst` / `useSvnOnly` / fallback strategy (lines 187-255)
4. **Replace with** a simple function:

```typescript
function getMajorVersion(ver?: string): number {
  if (!ver) return 0
  const match = ver.match(/^(\d+)\./)
  return match ? parseInt(match[1], 10) : 0
}
```

5. **Routing becomes**:

```typescript
const majorVersion = getMajorVersion(appVersion)
const useGit = majorVersion >= 10
console.log(`App version: ${appVersion ?? 'unknown'}, major: ${majorVersion}, routing: ${useGit ? 'GIT' : 'SVN'}`)
```

6. **If `useGit`**: call `/analyze-mpr/git` with `pat` credential. If it fails, return error (no SVN fallback).
7. **If not `useGit`** (Mendix 9 or unknown): call `/analyze-mpr/svn` with `password`/`api_key`. If it fails, return error.

**Keep the version refresh block** (lines 83-113) since we still need a real version number to parse the major version from. The DB might still have `1.0.0`.

### Simplified flow

```text
1. Authenticate user
2. Fetch credential
3. Read app version from DB
4. If version is '1.0.0' or missing:
   - Call Mendix API to get real modelVersion
   - Update DB
5. Parse major version number (e.g. "10.21.0..." -> 10)
6. If major >= 10 -> call GIT endpoint (requires PAT)
   If major < 10  -> call SVN endpoint (uses password/api_key)
7. Done — no fallback, no hash detection
```

### What gets removed
- `hasGitHash()` function
- `useGitFirst` / `useSvnOnly` variables
- The duplicated Git fetch block (lines 223-252)
- The "No PAT available" / "fallback" logic
- All the complex strategy logging

### What stays
- Version refresh from Mendix API (still needed to get a real version)
- Webhook callback architecture
- Railway health ping
- Error handling for analyzer failures

### Technical Details

The routing section (lines 187-292) will be replaced with approximately:

```typescript
const majorVersion = getMajorVersion(appVersion)
const useGit = majorVersion >= 10

console.log(`App version: ${appVersion ?? 'unknown'}, major: ${majorVersion}, routing: ${useGit ? 'GIT' : 'SVN'}`)

let accepted = false

if (useGit) {
  if (!credential.pat) {
    await supabase.from('linting_runs').update({ status: 'failed', completed_at: new Date().toISOString() }).eq('id', run.id)
    return new Response(JSON.stringify({ error: 'Mendix 10+ requires a PAT. Add one in Settings > Credentials.' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  console.log('Using GIT endpoint...')
  const gitRes = await fetch(`${baseUrl}/analyze-mpr/git`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': analyzerApiKey },
    body: JSON.stringify({
      projectId: appId, username: credential.username, pat: credential.pat,
      reportFormat: 'json', policies: enabledRuleIds, webhookUrl,
    }),
  })
  if (gitRes.ok) {
    accepted = true
  } else {
    const errText = await gitRes.text()
    console.error(`GIT endpoint failed (${gitRes.status}): ${errText}`)
    await supabase.from('linting_runs').update({ status: 'failed', completed_at: new Date().toISOString() }).eq('id', run.id)
    return new Response(JSON.stringify({ error: `Analyzer error: ${errText}` }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
} else {
  console.log('Using SVN endpoint...')
  const svnRes = await fetch(`${baseUrl}/analyze-mpr/svn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': analyzerApiKey },
    body: JSON.stringify({
      projectId: appId, username: credential.username,
      password: credential.password || credential.api_key,
      reportFormat: 'json', policies: enabledRuleIds, webhookUrl,
    }),
  })
  if (svnRes.ok) {
    accepted = true
  } else {
    const errText = await svnRes.text()
    console.error(`SVN endpoint failed (${svnRes.status}): ${errText}`)
    await supabase.from('linting_runs').update({ status: 'failed', completed_at: new Date().toISOString() }).eq('id', run.id)
    return new Response(JSON.stringify({ error: `Analyzer error: ${errText}` }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
}
```
