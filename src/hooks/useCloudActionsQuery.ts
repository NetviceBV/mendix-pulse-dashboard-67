import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/lib/queryKeys';
import { CloudActionRow, App } from '@/types/cloudActions';

export function useCloudActionsQuery() {
  return useQuery({
    queryKey: queryKeys.cloudActions,
    queryFn: async () => {
      const [actionsResult, appsResult] = await Promise.all([
        supabase
          .from('cloud_actions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('mendix_apps')
          .select('id, app_id, app_name, credential_id, project_id')
      ]);

      return {
        actions: (actionsResult.data || []) as CloudActionRow[],
        apps: (appsResult.data || []) as App[]
      };
    },
    staleTime: 10_000, // Data fresh for 10 seconds
    gcTime: 5 * 60_000, // Keep in cache for 5 minutes
  });
}
