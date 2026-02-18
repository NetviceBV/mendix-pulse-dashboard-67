

## Add Railway Health/Wake-up Ping Before Every Railway API Call

### Problem

The Railway container hosting the Mendix Analyzer sleeps after inactivity. When a request hits a sleeping container, it can time out or return errors (like 404). We need to wake it up before every call.

### Solution

Create a shared helper function in `supabase/functions/_shared/railway-utils.ts` and call it before every Railway API request across all 4 edge functions.

### Technical Changes

**1. New file: `supabase/functions/_shared/railway-utils.ts`**

Create a reusable wake-up helper:

```typescript
export async function pingRailwayHealth(baseUrl: string, apiKey?: string): Promise<void> {
  const healthUrl = `${baseUrl.replace(/\/$/, '')}/health`
  console.log(`[Railway] Pinging health endpoint: ${healthUrl}`)
  try {
    const res = await fetch(healthUrl, {
      method: 'GET',
      headers: apiKey ? { 'X-API-Key': apiKey } : {},
    })
    console.log(`[Railway] Health check response: ${res.status}`)
  } catch (e) {
    console.log(`[Railway] Health ping failed (container may be waking): ${e}`)
  }
}
```

**2. `supabase/functions/fetch-linting-policies/index.ts`**

- Import `pingRailwayHealth` from shared utils
- Call it before the `/policies` fetch (before line 46)

**3. `supabase/functions/run-linting-checks/index.ts`**

- Import `pingRailwayHealth` from shared utils
- Call it before the Git/SVN analyzer calls (before line 132, the `let accepted = false` line)

**4. `supabase/functions/run-owasp-checks/index.ts`**

- Import `pingRailwayHealth` from shared utils
- Call it inside `fetchAndCacheRailwayAnalysis()` before the `fetch(RAILWAY_ANALYZER_URL, ...)` call (before line 134)
- Use base URL derived from `RAILWAY_ANALYZER_URL` constant (strip `/analyze` path)

**5. `supabase/functions/owasp-check-railway-anonymous-entity/index.ts`**

- Import `pingRailwayHealth` from shared utils
- Call it inside the direct Railway fallback path, before the `fetch(RAILWAY_ANALYZER_URL, ...)` call (before line 111)
- Same base URL derivation as above

### Notes

- The health ping is non-blocking in terms of errors -- if it fails, we still proceed with the real request
- If the Railway app has no `/health` route, the request still wakes the container (even a 404 response means the process is running)
- Using a shared helper keeps this DRY and makes it easy to adjust the health endpoint path later

