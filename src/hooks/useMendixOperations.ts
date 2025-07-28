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

  const downloadLogs = async (appName: string, environmentName: string, date?: string) => {
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
          date
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      return data.logs;
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

  return {
    loading,
    startEnvironment,
    stopEnvironment,
    downloadLogs
  };
};