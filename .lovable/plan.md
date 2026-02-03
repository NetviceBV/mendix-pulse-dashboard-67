
## Plan: Extract Duplicate App Fetching Logic in Dashboard

### Problem Summary
The `Dashboard.tsx` component contains identical app fetching logic in two places:
- `useEffect` for initial load (lines 63-100)
- `refreshApps` function (lines 145-185)

This violates the DRY principle and makes maintenance error-prone - any fix or enhancement must be applied twice.

### Current Duplication

Both locations contain identical code:
1. Parallel fetch of `mendix_apps` and `mendix_environments`
2. Hash map creation for O(1) environment lookup
3. Merging environments into apps
4. Setting state with `setApps` and `setFilteredApps`

### Solution: Extract to Reusable Function

Create a single `fetchAppsData` function that both the initial load and refresh button use.

### Implementation

**Before (2 locations with ~40 lines each):**
```typescript
// In useEffect
const fetchApps = async () => {
  try {
    const [appsResult, environmentsResult] = await Promise.all([...]);
    // ... 30+ lines of identical logic
  } finally {
    setLoading(false);
  }
};

// In refreshApps
const refreshApps = async () => {
  setLoading(true);
  try {
    const [appsResult, environmentsResult] = await Promise.all([...]);
    // ... 30+ lines of identical logic
  } finally {
    setLoading(false);
  }
};
```

**After (1 shared function):**
```typescript
const fetchAppsData = async (showToast = false) => {
  setLoading(true);
  try {
    const [appsResult, environmentsResult] = await Promise.all([
      supabase
        .from('mendix_apps')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('mendix_environments')
        .select('*')
    ]);

    if (appsResult.error) throw appsResult.error;

    const appsData = appsResult.data || [];
    const environmentsData = environmentsResult.data || [];

    // Create map for O(1) lookup
    const environmentsByAppId = environmentsData.reduce((acc, env) => {
      const appId = env.app_id;
      if (!acc[appId]) acc[appId] = [];
      acc[appId].push(env);
      return acc;
    }, {} as Record<string, typeof environmentsData>);

    // Merge environments into apps
    const appsWithEnvironments: MendixApp[] = appsData.map(app => ({
      ...app,
      environments: environmentsByAppId[app.project_id || ''] || []
    }));

    setApps(appsWithEnvironments);
    setFilteredApps(appsWithEnvironments);

    if (showToast) {
      toast({
        title: "Applications refreshed",
        description: "Latest status updates have been loaded"
      });
    }
  } catch (error) {
    console.error('Error fetching apps:', error);
    setApps([]);
    setFilteredApps([]);
    if (showToast) {
      toast({
        title: "Refresh failed",
        description: "Could not load latest application data",
        variant: "destructive"
      });
    }
  } finally {
    setLoading(false);
  }
};

// Initial load
useEffect(() => {
  fetchAppsData(false);
}, []);

// Manual refresh (with toast feedback)
const refreshApps = () => fetchAppsData(true);
```

### Changes Summary

| Location | Lines Before | Lines After | Change |
|----------|-------------|-------------|--------|
| `fetchAppsData` function | 0 | ~45 | New shared function |
| Initial load `useEffect` | ~40 | ~3 | Calls shared function |
| `refreshApps` function | ~40 | ~1 | Wrapper for shared function |
| **Total** | ~80 | ~49 | **-31 lines (-39%)** |

### Key Design Decisions

1. **`showToast` parameter**: Distinguishes between silent initial load and user-triggered refresh
2. **Error handling**: Unified error handling with conditional toast display
3. **Loading state**: Managed consistently in one place

### Benefits

1. **DRY Principle**: Single source of truth for fetching logic
2. **Maintainability**: Bug fixes and optimizations apply everywhere
3. **Reduced Code**: ~31 fewer lines of duplicate code
4. **Consistency**: Guaranteed identical behavior for initial load and refresh
