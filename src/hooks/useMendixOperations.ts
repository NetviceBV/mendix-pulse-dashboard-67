import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const useMendixOperations = () => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const getCredentials = async () => {
    const { data: credentials, error } = await supabase
      .from('mendix_credentials')
      .select('*')
      .limit(1)
      .single();

    if (error || !credentials) {
      throw new Error('No Mendix credentials found. Please configure them in Settings.');
    }

    return credentials;
  };

  const startEnvironment = async (appName: string, environmentName: string) => {
    setLoading(true);
    try {
      const credentials = await getCredentials();
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('start-mendix-environment', {
        body: {
          credentialId: credentials.id,
          appName,
          environmentName
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      toast({
        title: "Environment Started",
        description: `Successfully started ${environmentName} environment`
      });

      return data;
    } catch (error: any) {
      toast({
        title: "Failed to Start Environment",
        description: error.message,
        variant: "destructive"
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const stopEnvironment = async (appName: string, environmentName: string) => {
    setLoading(true);
    try {
      const credentials = await getCredentials();
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('stop-mendix-environment', {
        body: {
          credentialId: credentials.id,
          appName,
          environmentName
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      toast({
        title: "Environment Stopped",
        description: `Successfully stopped ${environmentName} environment`
      });

      return data;
    } catch (error: any) {
      toast({
        title: "Failed to Stop Environment",
        description: error.message,
        variant: "destructive"
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const downloadLogs = async (appName: string, environmentName: string, date?: string, environmentId?: string) => {
    setLoading(true);
    try {
      const credentials = await getCredentials();
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('download-mendix-logs', {
        body: {
          credentialId: credentials.id,
          appName,
          environmentName,
          environmentId,
          date
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      return data.data.logs;
    } catch (error: any) {
      toast({
        title: "Failed to Download Logs",
        description: error.message,
        variant: "destructive"
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const fetchWebhookLogs = async (appId: string, environment: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('mendix_logs')
        .select('*')
        .eq('app_id', appId)
        .ilike('environment', environment)
        .order('timestamp', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error('Error fetching webhook logs:', error);
      toast({
        title: "Failed to fetch webhook logs",
        description: error.message,
        variant: "destructive"
      });
      return [];
    }
  };

  const refreshEnvironmentStatus = async (credentialId: string, appId: string, environmentId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('refresh-mendix-environment-status', {
        body: {
          credentialId,
          appId,
          environmentId,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) {
        throw error;
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to refresh environment status');
      }

      return data.environment;
    } catch (error) {
      console.error('Error refreshing environment status:', error);
      throw error;
    }
  };

  const getMicroflows = async (credentialId: string, appId: string) => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('get-mendix-microflows', {
        body: {
          credentialId,
          appId
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.message || 'Failed to fetch microflows');

      toast({
        title: "Microflows Retrieved",
        description: `Found ${data.data.count} microflows across ${Object.keys(data.data.microflowsByModule).length} modules`
      });

      return data.data;
    } catch (error: any) {
      toast({
        title: "Failed to Get Microflows",
        description: error.message,
        variant: "destructive"
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const getMicroflowActivities = async (credentialId: string, appId: string, microflowName: string, options?: { includeRaw?: boolean }) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('get-mendix-microflows', {
        body: {
          credentialId,
          appId,
          includeActivities: true,
          targetMicroflow: microflowName,
          includeRaw: options?.includeRaw === true,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.message || 'Failed to fetch microflow activities');

      // Debug logging when includeRaw is requested
      if (options?.includeRaw && data?.data) {
        try {
          const debug = (data as any).data?.debug;
          const mf = (data as any).data?.microflows?.find((mf: any) => mf.name === microflowName);
          const sample = mf?.activities?.slice?.(0, 5)?.map((a: any) => ({
            id: a.id, type: a.type, name: a.name, captionText: a?.properties?.captionText
          }));
          // eslint-disable-next-line no-console
          console.debug('[getMicroflowActivities] Debug', {
            target: microflowName,
            hasDebug: !!debug,
            debugRawSample: debug?.rawSample ? 'present' : 'absent',
            firstActivities: sample,
          });
        } catch (e) {
          // eslint-disable-next-line no-console
          console.debug('[getMicroflowActivities] Debug logging failed', e);
        }
      }

      // Find the specific microflow in the response
      const microflow = data.data.microflows.find((mf: any) => mf.name === microflowName);
      return microflow?.activities || [];
    } catch (error: any) {
      toast({
        title: "Failed to Get Activities",
        description: error.message,
        variant: "destructive"
      });
      throw error;
    }
  };

  return {
    loading,
    startEnvironment,
    stopEnvironment,
    downloadLogs,
    fetchWebhookLogs,
    refreshEnvironmentStatus,
    getMicroflows,
    getMicroflowActivities
  };
};