import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/lib/queryKeys';
import { MendixApp } from '@/components/AppCard';

export function useAppsQuery() {
  return useQuery({
    queryKey: queryKeys.appsWithEnvironments,
    queryFn: async () => {
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
      return appsData.map(app => ({
        ...app,
        environments: environmentsByAppId[app.project_id || ''] || []
      })) as MendixApp[];
    },
    staleTime: 30_000, // Data fresh for 30 seconds
    gcTime: 5 * 60_000, // Keep in cache for 5 minutes
  });
}
