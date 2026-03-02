

## Auto-Sync Apps on Login

### Overview
After a successful login, automatically call the `fetch-mendix-apps` edge function for each of the user's saved credentials to sync fresh data from the Mendix Deploy API. Show a toast notification informing the user that apps are being refreshed.

### Approach
Add a one-time sync effect in `Dashboard.tsx` that runs when the component first mounts. It will:
1. Fetch the user's credentials from the database
2. For each credential, invoke the `fetch-mendix-apps` edge function in the background
3. Show a toast: "Syncing applications from Mendix..."
4. On completion, invalidate the apps query cache so the dashboard updates
5. Show a success/failure toast

A `sessionStorage` flag will prevent re-syncing on every page navigation -- only on fresh login (when the flag is not yet set).

### Files Changed

**`src/pages/Dashboard.tsx`**
- Add a `useEffect` that runs once on mount
- Check `sessionStorage` for a `mendix-apps-synced` flag to avoid re-syncing on navigation
- Fetch credentials from `mendix_credentials` table
- For each credential, call `supabase.functions.invoke('fetch-mendix-apps', { body: { credentialId } })`
- Show a toast notification during sync ("Syncing your Mendix applications...")
- On success, invalidate the `appsWithEnvironments` query and show completion toast
- Set the `sessionStorage` flag after sync
- If no credentials exist, skip silently (user hasn't configured yet)

### Technical Detail

```text
Dashboard.tsx useEffect (runs once on mount):

  if sessionStorage has 'mendix-apps-synced' -> skip
  
  toast("Syncing your Mendix applications...")
  
  fetch credentials from mendix_credentials table
  if no credentials -> skip, set flag
  
  for each credential:
    await supabase.functions.invoke('fetch-mendix-apps', { body: { credentialId } })
  
  invalidateQueries(appsWithEnvironments)
  toast("Applications synced successfully")
  sessionStorage.set('mendix-apps-synced', 'true')
  
  on error: toast warning but don't block dashboard
```

The `sessionStorage` flag is cleared automatically when the browser tab is closed or on sign-out (we'll clear it in the `handleSignOut` function in `Index.tsx`).

### Edge Cases
- No credentials configured: skip sync silently
- Edge function fails: show warning toast, dashboard still works with cached data
- Multiple credentials: sync all in parallel
- User navigates away and back: `sessionStorage` flag prevents re-sync within same session

