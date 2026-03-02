import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const QUERY_KEY = ["inactivity-settings"] as const;

export function useInactivitySettings() {
  const queryClient = useQueryClient();

  const { data: timeoutMinutes = 10, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 10;

      const { data, error } = await supabase
        .from("profiles")
        .select("inactivity_timeout_minutes")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error || !data) return 10;
      return (data as any).inactivity_timeout_minutes as number ?? 10;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (minutes: number) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("profiles")
        .update({ inactivity_timeout_minutes: minutes } as any)
        .eq("user_id", user.id);

      if (error) throw error;
      return minutes;
    },
    onSuccess: (minutes) => {
      queryClient.setQueryData(QUERY_KEY, minutes);
    },
  });

  return {
    timeoutMinutes,
    isLoading,
    updateTimeout: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  };
}
