

## Plan: Fix N+1 Query Pattern in Dashboard

### Problem
The current code makes **N+1 database queries**:
- 1 query to fetch all apps
- N queries to fetch environments (one per app)

With 20 apps, this means 21 separate database calls.

### Solution
Fetch both apps and environments in **just 2 queries**, then join them in JavaScript:

```text
┌─────────────────────────────────────────────────────────┐
│ Current (N+1 Pattern)                                   │
├─────────────────────────────────────────────────────────┤
│ Query 1: SELECT * FROM mendix_apps                      │
│ Query 2: SELECT * FROM mendix_environments WHERE app=1  │
│ Query 3: SELECT * FROM mendix_environments WHERE app=2  │
│ Query 4: SELECT * FROM mendix_environments WHERE app=3  │
│ ... (continues for each app)                            │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Fixed (2 Queries)                                       │
├─────────────────────────────────────────────────────────┤
│ Query 1: SELECT * FROM mendix_apps                      │
│ Query 2: SELECT * FROM mendix_environments              │
│ JavaScript: Map environments to apps using project_id   │
└─────────────────────────────────────────────────────────┘
```

### Changes

**File: `src/pages/Dashboard.tsx`**

Replace the `fetchApps` function (lines 70-104) with optimized version:

```typescript
const fetchApps = async () => {
  try {
    // Fetch apps and environments in parallel (2 queries instead of N+1)
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

    // Create a map of project_id -> environments for efficient lookup
    const environmentsByAppId = environmentsData.reduce((acc, env) => {
      const appId = env.app_id;
      if (!acc[appId]) acc[appId] = [];
      acc[appId].push(env);
      return acc;
    }, {} as Record<string, typeof environmentsData>);

    // Map environments to apps
    const appsWithEnvironments = appsData.map(app => ({
      ...app,
      environments: environmentsByAppId[app.project_id || ''] || []
    }));

    setApps(appsWithEnvironments);
    setFilteredApps(appsWithEnvironments);
  } catch (error) {
    console.error('Error fetching apps:', error);
    setApps([]);
    setFilteredApps([]);
  } finally {
    setLoading(false);
  }
};
```

Apply the same fix to `refreshApps` function (lines 164-206).

### Technical Details

| Aspect | Before | After |
|--------|--------|-------|
| **Database queries** | N+1 (21 for 20 apps) | 2 (always) |
| **Query execution** | Sequential | Parallel (`Promise.all`) |
| **Data joining** | Server-side per query | Client-side O(n) mapping |
| **Performance** | Slow with many apps | Constant 2 queries |

### Why This Is Safe
- Same data is fetched, just more efficiently
- `Promise.all` runs both queries in parallel
- Uses a hash map for O(1) environment lookup per app
- Falls back to empty array if no environments found (same as before)
- No changes to the component rendering logic

