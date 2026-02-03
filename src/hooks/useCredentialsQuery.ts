import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/lib/queryKeys';
import { MendixCredential } from '@/components/MendixCredentials';

export function useCredentialsQuery() {
  return useQuery({
    queryKey: queryKeys.credentials,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mendix_credentials')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as MendixCredential[];
    },
    staleTime: 60_000, // Credentials don't change often
    gcTime: 10 * 60_000,
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
      return data as MendixCredential;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.credentials });
    },
  });
}

export function useUpdateCredentialMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...credential }: { id: string; name?: string; username?: string; api_key?: string; pat?: string }) => {
      const { error } = await supabase
        .from('mendix_credentials')
        .update(credential)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.credentials });
    },
  });
}

export function useDeleteCredentialMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('mendix_credentials')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.credentials });
    },
  });
}
