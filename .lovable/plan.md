

## Inactivity Auto-Logout with Configurable Timeout

### Overview
Implement an automatic logout after a period of inactivity, with a configurable timeout setting stored in the user's profile. Default is 10 minutes. A warning toast appears 1 minute before logout. The timeout value can be changed from a new "General" settings tab.

### Database Change

Add a column to the existing `profiles` table:
- `inactivity_timeout_minutes` (integer, default 10, not null)

This avoids creating a new table. The `profiles` table already has RLS for the authenticated user.

### New Files

**`src/hooks/useInactivityTimeout.ts`**
- Custom hook that accepts `timeoutMs`, `onWarning`, and `onTimeout` callbacks
- Listens for `mousemove`, `keydown`, `click`, `scroll`, `touchstart` on `window`
- Throttles activity detection (once per 30s) to avoid excessive timer resets
- Sets two timers: warning at `timeoutMs - 60000` and logout at `timeoutMs`
- Cleans up listeners and timers on unmount
- Only active when `timeoutMs > 0`

**`src/hooks/useInactivitySettings.ts`**
- Custom hook that fetches the user's `inactivity_timeout_minutes` from `profiles`
- Returns the current value and a function to update it
- Uses React Query for caching

**`src/components/GeneralSettings.tsx`**
- New settings tab component with a slider (5-60 minutes) and a label showing the current value
- Saves changes to the `profiles` table
- Shows a toast on save

### Modified Files

**`src/pages/Index.tsx`**
- Import and use `useInactivityTimeout` and `useInactivitySettings` when user is authenticated
- Pass `handleSignOut` as the timeout callback
- Show warning toast 1 minute before auto-logout: "You will be logged out in 1 minute due to inactivity"
- On timeout: call `handleSignOut()` and show a toast explaining the logout reason

**`src/pages/Settings.tsx`**
- Add a new "General" tab (first in the list) containing the `GeneralSettings` component
- This tab houses the inactivity timeout slider

### Technical Flow

```text
1. User logs in -> Index.tsx renders Dashboard
2. useInactivitySettings fetches profiles.inactivity_timeout_minutes (default: 10)
3. useInactivityTimeout starts with timeoutMs = minutes * 60000
4. User activity (mouse/key/click/scroll/touch) resets the timer
5. At (timeout - 1 min): warning toast appears
6. At timeout: handleSignOut() is called, user sees "Logged out due to inactivity"
7. User can change timeout in Settings -> General tab via a slider
8. Change is saved to profiles table and takes effect immediately
```

### Migration

```sql
ALTER TABLE profiles
ADD COLUMN inactivity_timeout_minutes integer NOT NULL DEFAULT 10;
```

### Edge Cases
- If user sets a very low timeout (5 min), warning still shows at 1 min before
- The hook is only active on authenticated pages (Index.tsx wraps Dashboard)
- Settings page also needs the hook -- it will be added at the Index.tsx level which covers the Dashboard, but Settings is a separate route. The hook should also be used in Settings.tsx
- Navigation between pages within the app does NOT reset the timer (activity events do)
- If the profiles row doesn't exist yet, fall back to 10 minutes

