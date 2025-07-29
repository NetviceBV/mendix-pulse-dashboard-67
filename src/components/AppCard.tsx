import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  ExternalLink,
  Clock,
  Users,
  Code,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import LogsViewer from "./LogsViewer";
import { useMendixOperations } from "@/hooks/useMendixOperations";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface MendixEnvironment {
  id: string;
  environment_id: string | null;
  environment_name: string;
  status: string;
  url?: string;
  model_version?: string;
  runtime_version?: string;
}

export interface MendixApp {
  id: string;
  project_id: string | null;
  app_id: string | null;
  app_name: string;
  status: string;
  environment: string;
  last_deployed: string | null;
  version: string | null;
  active_users: number | null;
  error_count: number | null;
  app_url?: string;
  environments?: MendixEnvironment[];
}

interface AppCardProps {
  app: MendixApp;
  onOpenApp: (app: MendixApp) => void;
  onRefresh?: () => void;
}

const statusConfig = {
  healthy: {
    icon: CheckCircle,
    color: "success",
    gradient: "bg-gradient-success",
    text: "Healthy"
  },
  warning: {
    icon: AlertTriangle,
    color: "warning",
    gradient: "bg-gradient-warning",
    text: "Warning"
  },
  error: {
    icon: XCircle,
    color: "error",
    gradient: "bg-gradient-error",
    text: "Error"
  },
  offline: {
    icon: XCircle,
    color: "muted",
    gradient: "bg-muted",
    text: "Offline"
  }
};

const environmentColors = {
  production: "bg-gradient-error",
  acceptance: "bg-gradient-warning", 
  test: "bg-gradient-success"
};

const AppCard = ({ app, onOpenApp, onRefresh }: AppCardProps) => {
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState("");
  const [logsEnvironment, setLogsEnvironment] = useState<{ name: string; id: string; appId: string } | null>(null);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [pendingStopEnv, setPendingStopEnv] = useState<{ id: string; name: string; appId: string } | null>(null);
  
  const [environmentStatuses, setEnvironmentStatuses] = useState<Record<string, { status: string; loading: boolean }>>({});
  const [environmentErrorCounts, setEnvironmentErrorCounts] = useState<Record<string, number>>({});
  const { loading, startEnvironment, stopEnvironment, downloadLogs, refreshEnvironmentStatus } = useMendixOperations();

  // Sort environments in the specified order
  const sortEnvironments = (environments: MendixEnvironment[]) => {
    const order = ['sandbox', 'test', 'acceptance', 'production'];
    return [...environments].sort((a, b) => {
      const aIndex = order.indexOf(a.environment_name.toLowerCase());
      const bIndex = order.indexOf(b.environment_name.toLowerCase());
      const aOrder = aIndex === -1 ? 999 : aIndex;
      const bOrder = bIndex === -1 ? 999 : bIndex;
      return aOrder - bOrder;
    });
  };

  // Fetch error counts for each environment
  useEffect(() => {
    const fetchEnvironmentErrorCounts = async () => {
      if (!app.environments || app.environments.length === 0) return;
      
      try {
        const { data: errorCounts, error } = await supabase
          .from('mendix_logs')
          .select('environment, level')
          .eq('app_id', app.app_id)
          .in('level', ['Error', 'Critical']);

        if (error) {
          console.error('Error fetching environment error counts:', error);
          return;
        }

        const counts: Record<string, number> = {};
        errorCounts?.forEach(log => {
          if (log.level === 'Error' || log.level === 'Critical') {
            counts[log.environment] = (counts[log.environment] || 0) + 1;
          }
        });
        
        setEnvironmentErrorCounts(counts);
      } catch (error) {
        console.error('Failed to fetch environment error counts:', error);
      }
    };

    fetchEnvironmentErrorCounts();
  }, [app.app_id, app.environments]);

  const handleRefreshEnvironment = async (env: MendixEnvironment) => {
    const envKey = env.environment_id || env.id;
    setEnvironmentStatuses(prev => ({ ...prev, [envKey]: { ...prev[envKey], loading: true } }));
    
    try {
      // Get credentials first to find the credential ID
      const { data: credentials, error } = await supabase
        .from('mendix_credentials')
        .select('*')
        .limit(1)
        .single();

      if (error || !credentials) {
        throw new Error('No Mendix credentials found');
      }

      const updatedEnv = await refreshEnvironmentStatus(
        credentials.id,
        app.app_id || app.app_name,
        env.environment_id || env.id
      );
      
      setEnvironmentStatuses(prev => ({ 
        ...prev, 
        [envKey]: { status: updatedEnv.status, loading: false } 
      }));
      
      // Refresh the full app data
      onRefresh?.();
    } catch (error) {
      console.error('Failed to refresh environment status:', error);
      setEnvironmentStatuses(prev => ({ ...prev, [envKey]: { ...prev[envKey], loading: false } }));
    }
  };

  const getEnvironmentStatus = (env: MendixEnvironment) => {
    const envKey = env.environment_id || env.id;
    const statusOverride = environmentStatuses[envKey];
    return statusOverride?.status || env.status;
  };

  const isEnvironmentLoading = (env: MendixEnvironment) => {
    const envKey = env.environment_id || env.id;
    return environmentStatuses[envKey]?.loading || false;
  };

  return (
    <Card className={cn(
      "border-border hover:shadow-glow transition-all duration-300 cursor-pointer group",
      // Solid colored backgrounds based on status
      app.status === "healthy" && "bg-gradient-card",
      app.status === "warning" && "bg-error/15 border-error/30 shadow-lg shadow-error/20",
      app.status === "error" && "bg-error/25 border-error/50 shadow-xl shadow-error/40",
      app.status === "offline" && "bg-muted/50 border-muted-foreground/20",
      // Enhanced hover effects for problematic apps
      app.status === "error" && "hover:shadow-2xl hover:shadow-error/50 hover:border-error/70",
      app.status === "warning" && "hover:shadow-xl hover:shadow-error/30 hover:border-error/50"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg truncate group-hover:text-primary transition-colors">
              {app.app_name}
            </h3>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {app.environments && app.environments.length > 0 && (
          <div className="space-y-2 mb-4">
            <h4 className="text-sm font-medium text-muted-foreground">Environments</h4>
            <div className="grid gap-2">
              {sortEnvironments(app.environments).map((env) => {
                const envErrorCount = environmentErrorCounts[env.environment_name] || 0;
                const statusInfo = statusConfig[getEnvironmentStatus(env)?.toLowerCase() === 'running' ? 'healthy' : getEnvironmentStatus(env)?.toLowerCase() === 'stopped' ? 'error' : 'warning'] || statusConfig.offline;
                const StatusIcon = statusInfo.icon;
                
                return (
                <div key={env.id} className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{env.environment_name}</span>
                      {env.model_version && (
                        <span className="text-xs text-muted-foreground">v{env.model_version}</span>
                      )}
                    </div>
                    
                    {/* Show either error count or health status */}
                    {envErrorCount > 0 ? (
                      <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-error/10 text-error">
                        <AlertTriangle className="w-3 h-3" />
                        <span className="text-xs font-medium">{envErrorCount} errors</span>
                      </div>
                    ) : (
                      <div className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium",
                        statusInfo.gradient,
                        getEnvironmentStatus(env)?.toLowerCase() === 'running' ? "text-white" : "text-white"
                      )}>
                        <StatusIcon className="w-3 h-3" />
                        {getEnvironmentStatus(env)?.toLowerCase() === 'running' ? 'Healthy' : 
                         getEnvironmentStatus(env)?.toLowerCase() === 'stopped' ? 'Stopped' : 'Unknown'}
                      </div>
                    )}
                    
                    {isEnvironmentLoading(env) && (
                      <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Only show start/stop buttons for non-production environments */}
                    {env.environment_name.toLowerCase() !== 'production' && (
                      <div className="flex gap-1">
                        {getEnvironmentStatus(env)?.toLowerCase() === 'stopped' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs"
                            disabled={loading || isEnvironmentLoading(env)}
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                // Optimistic update
                                const envKey = env.environment_id || env.id;
                                setEnvironmentStatuses(prev => ({ 
                                  ...prev, 
                                  [envKey]: { status: 'starting...', loading: true } 
                                }));
                                
                                await startEnvironment(app.app_id, env.environment_name);
                                await handleRefreshEnvironment(env);
                              } catch (error) {
                                // Reset on error
                                const envKey = env.environment_id || env.id;
                                setEnvironmentStatuses(prev => ({ 
                                  ...prev, 
                                  [envKey]: { status: env.status, loading: false } 
                                }));
                              }
                            }}
                          >
                            {loading || isEnvironmentLoading(env) ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Start'}
                          </Button>
                        )}
                        {getEnvironmentStatus(env)?.toLowerCase() === 'running' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs"
                            disabled={loading || isEnvironmentLoading(env)}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPendingStopEnv({ id: env.environment_id, name: env.environment_name, appId: app.app_id });
                              setStopDialogOpen(true);
                            }}
                          >
                            Stop
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-xs"
                          disabled={loading || isEnvironmentLoading(env)}
                          onClick={() => handleRefreshEnvironment(env)}
                          title="Refresh environment status"
                        >
                          🔄
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-xs"
                          disabled={loading}
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              setLogsEnvironment({ name: env.environment_name, id: env.environment_id, appId: app.app_id });
                              const logData = await downloadLogs(app.app_name, env.environment_name);
                              setLogs(logData || 'No logs available');
                              setLogsOpen(true);
                            } catch (error) {
                              // Error already handled in hook
                            }
                          }}
                        >
                          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Logs'}
                        </Button>
                      </div>
                    )}
                    {env.url && (
                      <ExternalLink 
                        className="h-3 w-3 text-muted-foreground cursor-pointer hover:text-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(env.url, '_blank');
                        }}
                      />
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>

      {/* Stop Environment Confirmation Dialog */}
      <AlertDialog open={stopDialogOpen} onOpenChange={setStopDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop Environment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to stop the "{pendingStopEnv?.name}" environment? 
              This will make the application unavailable until it's started again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingStopEnv(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (pendingStopEnv) {
                  try {
                    // Optimistic update
                    setEnvironmentStatuses(prev => ({ 
                      ...prev, 
                      [pendingStopEnv.id]: { status: 'stopping...', loading: true } 
                    }));
                    
                    await stopEnvironment(pendingStopEnv.appId, pendingStopEnv.name);
                    
                    // Find the environment to refresh
                    const env = app.environments?.find(e => e.environment_id === pendingStopEnv.id);
                    if (env) {
                      await handleRefreshEnvironment(env);
                    }
                  } catch (error) {
                    // Reset on error
                    const originalEnv = app.environments?.find(e => e.environment_id === pendingStopEnv.id);
                    if (originalEnv) {
                      setEnvironmentStatuses(prev => ({ 
                        ...prev, 
                        [pendingStopEnv.id]: { status: originalEnv.status, loading: false } 
                      }));
                    }
                  }
                  setPendingStopEnv(null);
                  setStopDialogOpen(false);
                }
              }}
            >
              Stop Environment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Logs Viewer */}
      {logsEnvironment && (
        <LogsViewer
          open={logsOpen}
          onClose={() => {
            setLogsOpen(false);
            setLogsEnvironment(null);
            setLogs("");
          }}
          logs={logs}
          environmentName={logsEnvironment.name}
          appName={app.app_name}
          loading={loading}
          onDownloadDate={async (date) => {
            try {
              const dateStr = format(date, 'yyyy-MM-dd');
              const logData = await downloadLogs(logsEnvironment.appId, logsEnvironment.name, dateStr);
              setLogs(logData || 'No logs available for selected date');
            } catch (error) {
              // Error already handled in hook
            }
          }}
        />
      )}
    </Card>
  );
};

export default AppCard;