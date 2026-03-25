

## Fix: Stale App Data Shown After User Switch

### Root Cause
The React Query cache persists across sign-in/sign-out because `queryClient` is a module-level singleton in `App.tsx`. When User B logs in, the cache still holds User A's apps. RLS will return correct data on the next fetch, but the stale cache is shown first.

### Changes

#### 1. Clear React Query cache on sign-out (`src/pages/Index.tsx`)
- Import and use `useQueryClient()` in the `Index` component
- Call `queryClient.clear()` in `handleSignOut` before `supabase.auth.signOut()`
- This removes all cached data immediately so the next user starts fresh

#### 2. Clear cache on auth state change (`src/pages/Index.tsx`)
- In the `onAuthStateChange` listener, when event is `SIGNED_OUT`, call `queryClient.clear()`
- This catches edge cases like token expiry or external sign-out

### Technical Detail
One-line additions:
- `const queryClient = useQueryClient();` in the Index component
- `queryClient.clear();` in `handleSignOut` and in the `SIGNED_OUT` event handler

No database or edge function changes needed. The RLS policies are correct -- this is purely a client-side caching issue.

