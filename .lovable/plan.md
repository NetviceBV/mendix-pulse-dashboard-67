
## Plan: Implement React Query for Data Fetching with Loading Skeletons

### Problem Summary
The application currently uses manual state management (`useState` + `useEffect`) for data fetching across multiple pages, which leads to:
- No automatic caching or request deduplication
- Manual loading state management
- No automatic background refetching
- Spinner-based loading states that cause layout shifts

### Current Architecture

| Page/Component | Data Fetched | Current Pattern |
|----------------|--------------|-----------------|
| `Dashboard.tsx` | `mendix_apps`, `mendix_environments` | `useState` + `useEffect` + `fetchAppsData()` |
| `CloudActions.tsx` | `cloud_actions`, `mendix_apps` | `useState` + `useEffect` + `load()` |
| `Settings.tsx` | User auth check | `useState` + `useEffect` |
| `MendixCredentials.tsx` | `mendix_credentials` | `useState` + `useEffect` |
| `AppCard.tsx` | Error counts, OWASP data | `useState` + `useEffect` |

### Existing Infrastructure
- **React Query is already installed** (`@tanstack/react-query ^5.56.2`)
- **QueryClientProvider is configured** in `App.tsx` (line 14)
- **Skeleton component exists** in `src/components/ui/skeleton.tsx`

### Solution Overview

1. **Create custom React Query hooks** for each data domain
2. **Replace manual data fetching** with React Query hooks
3. **Add skeleton components** for better perceived performance
4. **Maintain real-time subscriptions** alongside React Query

---

### Implementation Details

#### Step 1: Create Query Key Constants

Create `src/lib/queryKeys.ts` to centralize query keys for cache management:

```typescript
export const queryKeys = {
  apps: ['apps'] as const,
  environments: ['environments'] as const,
  appsWithEnvironments: ['apps-with-environments'] as const,
  cloudActions: ['cloud-actions'] as const,
  credentials: ['credentials'] as const,
  webhookLogs: (appId: string, env: string) => ['webhook-logs', appId, env] as const,
  owaspItems: (appId: string) => ['owasp-items', appId] as const,
  vulnerabilities: (appId: string) => ['vulnerabilities', appId] as const,
};
```

#### Step 2: Create Custom Hooks

**File: `src/hooks/useAppsQuery.ts`**

```typescript
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/lib/queryKeys';
import { MendixApp } from '@/components/AppCard';

export function useAppsQuery() {
  return useQuery({
    queryKey: queryKeys.appsWithEnvironments,
    queryFn: async () => {
      const [appsResult, environmentsResult] = await Promise.all([
        supabase.from('mendix_apps').select('*').order('created_at', { ascending: false }),
        supabase.from('mendix_environments').select('*')
      ]);

      if (appsResult.error) throw appsResult.error;

      const appsData = appsResult.data || [];
      const environmentsData = environmentsResult.data || [];

      const environmentsByAppId = environmentsData.reduce((acc, env) => {
        const appId = env.app_id;
        if (!acc[appId]) acc[appId] = [];
        acc[appId].push(env);
        return acc;
      }, {} as Record<string, typeof environmentsData>);

      return appsData.map(app => ({
        ...app,
        environments: environmentsByAppId[app.project_id || ''] || []
      })) as MendixApp[];
    },
    staleTime: 30_000, // Data fresh for 30 seconds
    gcTime: 5 * 60_000, // Keep in cache for 5 minutes
  });
}
```

**File: `src/hooks/useCloudActionsQuery.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/lib/queryKeys';
import { CloudActionRow, App } from '@/types/cloudActions';

export function useCloudActionsQuery() {
  return useQuery({
    queryKey: queryKeys.cloudActions,
    queryFn: async () => {
      const [actionsResult, appsResult] = await Promise.all([
        supabase.from('cloud_actions').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('mendix_apps').select('id, app_id, app_name, credential_id, project_id')
      ]);

      return {
        actions: (actionsResult.data || []) as CloudActionRow[],
        apps: (appsResult.data || []) as App[]
      };
    },
    staleTime: 10_000,
  });
}
```

**File: `src/hooks/useCredentialsQuery.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/lib/queryKeys';

export function useCredentialsQuery() {
  return useQuery({
    queryKey: queryKeys.credentials,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mendix_credentials')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useAddCredentialMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (credential: { name: string; username: string; api_key: string; pat: string }) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');
      
      const { data, error } = await supabase
        .from('mendix_credentials')
        .insert({ user_id: user.user.id, ...credential })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.credentials });
    },
  });
}
```

#### Step 3: Create Skeleton Components

**File: `src/components/AppCardSkeleton.tsx`**

```typescript
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function AppCardSkeleton() {
  return (
    <Card className="bg-gradient-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}
```

**File: `src/components/CloudActionTableSkeleton.tsx`**

```typescript
import { TableRow, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

export function CloudActionTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-6 w-20 rounded" /></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end gap-2">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-20" />
            </div>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}
```

**File: `src/components/DashboardSkeleton.tsx`**

```typescript
import { Skeleton } from "@/components/ui/skeleton";
import { AppCardSkeleton } from "./AppCardSkeleton";

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Search skeleton */}
      <div className="relative max-w-md">
        <Skeleton className="h-10 w-full" />
      </div>
      
      {/* Tabs skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-10 w-full max-w-md" />
        
        {/* Grid of app cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <AppCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
```

#### Step 4: Update Dashboard Component

Replace the manual fetching with React Query:

```typescript
// Before
const [apps, setApps] = useState<MendixApp[]>([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  fetchAppsData(false);
}, []);

// After
import { useAppsQuery } from "@/hooks/useAppsQuery";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";

const { data: apps = [], isLoading, refetch } = useAppsQuery();

// Remove fetchAppsData function
// Replace loading spinner with skeleton
if (isLoading) {
  return (
    <div className="min-h-screen bg-background">
      <header>...</header>
      <div className="container mx-auto px-4 py-6">
        <DashboardSkeleton />
      </div>
    </div>
  );
}
```

#### Step 5: Update CloudActions Page

```typescript
// Before
const [loading, setLoading] = useState(true);
const [actions, setActions] = useState<CloudActionRow[]>([]);
const [apps, setApps] = useState<App[]>([]);

// After
import { useCloudActionsQuery } from "@/hooks/useCloudActionsQuery";
import { CloudActionTableSkeleton } from "@/components/CloudActionTableSkeleton";

const { data, isLoading, refetch } = useCloudActionsQuery();
const actions = data?.actions || [];
const apps = data?.apps || [];

// In table body
{isLoading && <CloudActionTableSkeleton rows={5} />}
```

#### Step 6: Integrate with Real-time Subscriptions

Real-time subscriptions will invalidate React Query cache on changes:

```typescript
useEffect(() => {
  const channel = supabase
    .channel('schema-db-changes')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'mendix_apps'
    }, () => {
      // Invalidate cache to trigger refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.appsWithEnvironments });
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
}, [queryClient]);
```

---

### Files to Create

| File | Purpose |
|------|---------|
| `src/lib/queryKeys.ts` | Centralized query key management |
| `src/hooks/useAppsQuery.ts` | Dashboard apps data fetching |
| `src/hooks/useCloudActionsQuery.ts` | Cloud actions data fetching |
| `src/hooks/useCredentialsQuery.ts` | Credentials CRUD operations |
| `src/components/AppCardSkeleton.tsx` | App card loading skeleton |
| `src/components/CloudActionTableSkeleton.tsx` | Cloud actions table skeleton |
| `src/components/DashboardSkeleton.tsx` | Full dashboard loading skeleton |

### Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Dashboard.tsx` | Replace manual fetching with `useAppsQuery`, add skeleton loading |
| `src/pages/CloudActions.tsx` | Replace manual fetching with `useCloudActionsQuery`, add skeleton |
| `src/components/MendixCredentials.tsx` | Replace manual fetching with `useCredentialsQuery` |

---

### Benefits

| Benefit | Description |
|---------|-------------|
| **Automatic Caching** | Data cached for 30 seconds, reducing redundant API calls |
| **Request Deduplication** | Multiple components requesting same data share one request |
| **Background Refetching** | Data refreshed automatically when returning to page |
| **Better UX** | Skeleton loaders maintain layout during loading, no layout shifts |
| **Simpler Code** | ~50% reduction in data fetching boilerplate per component |
| **DevTools** | React Query DevTools available for debugging cache state |

### Configuration

The QueryClient in `App.tsx` can be enhanced with default options:

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30 seconds
      gcTime: 5 * 60_000, // 5 minutes
      retry: 2,
      refetchOnWindowFocus: true,
    },
  },
});
```
