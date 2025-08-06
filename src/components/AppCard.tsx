import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
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
  Loader2,
  ChevronDown,
  RefreshCw,
  FileText,
  Copy,
  Check,
  Shield
} from "lucide-react";
import { cn } from "@/lib/utils";
import LogsViewer from "./LogsViewer";
import { VulnerabilityScanDialog } from "./VulnerabilityScanDialog";
import { useMendixOperations } from "@/hooks/useMendixOperations";
import { MicroflowsDialog, type MicroflowsResponse } from "./MicroflowsDialog";
import { toast } from "@/hooks/use-toast";
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
  production: "bg-red-500/10 border-red-500/30",
  acceptance: "bg-yellow-500/10 border-yellow-500/30", 
  test: "bg-green-500/10 border-green-500/30",
  sandbox: "bg-blue-500/10 border-blue-500/30"
};

const AppCard = ({ app, onOpenApp, onRefresh }: AppCardProps) => {
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState("");
  const [webhookLogs, setWebhookLogs] = useState<any[]>([]);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [logsEnvironment, setLogsEnvironment] = useState<{ name: string; id: string; appId: string } | null>(null);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [pendingStopEnv, setPendingStopEnv] = useState<{ id: string; name: string; appId: string } | null>(null);
  const [collapsedEnvironments, setCollapsedEnvironments] = useState<Record<string, boolean>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [vulnerabilityScanOpen, setVulnerabilityScanOpen] = useState(false);
  const [selectedEnvironmentForScan, setSelectedEnvironmentForScan] = useState<{ name: string; appId: string } | null>(null);
  const [vulnerabilityCount, setVulnerabilityCount] = useState(0);
  const [showVulnerabilityResults, setShowVulnerabilityResults] = useState(false);
  
  const [environmentStatuses, setEnvironmentStatuses] = useState<Record<string, { status: string; loading: boolean }>>({});
  const [environmentErrorCounts, setEnvironmentErrorCounts] = useState<Record<string, number>>({});
  const [microflowsDialogOpen, setMicroflowsDialogOpen] = useState(false);
  const [microflowsData, setMicroflowsData] = useState<MicroflowsResponse | null>(null);
  const [microflowsLoading, setMicroflowsLoading] = useState(false);
  const { loading, startEnvironment, stopEnvironment, downloadLogs, fetchWebhookLogs, refreshEnvironmentStatus, getMicroflows } = useMendixOperations();

  // Utility function to capitalize environment names for display
  const capitalizeEnvironmentName = (envName: string) => {
    return envName.charAt(0).toUpperCase() + envName.slice(1).toLowerCase();
  };

  const handleCopy = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      toast({
        title: "Copied to clipboard",
        description: `${fieldName} has been copied successfully.`,
      });
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Unable to copy to clipboard.",
        variant: "destructive",
      });
    }
  };

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

  // Fetch error counts for each environment and set default collapse states
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
            // Find matching environment using case-insensitive comparison
            const matchingEnv = app.environments.find(env => 
              env.environment_name.toLowerCase() === log.environment.toLowerCase()
            );
            if (matchingEnv) {
              const envKey = matchingEnv.environment_name;
              counts[envKey] = (counts[envKey] || 0) + 1;
            }
          }
        });
        
        setEnvironmentErrorCounts(counts);

        // Set default collapse states - expand environments with errors
        const defaultCollapsed: Record<string, boolean> = {};
        app.environments.forEach(env => {
          const envErrorCount = counts[env.environment_name] || 0;
          defaultCollapsed[env.id] = envErrorCount === 0; // Collapse if no errors
        });
        setCollapsedEnvironments(defaultCollapsed);
        
      } catch (error) {
        console.error('Failed to fetch environment error counts:', error);
      }
    };

    const fetchVulnerabilityCount = async () => {
      if (!app.app_id) return;
      
      try {
        // Get the latest scan for this app
        const { data: latestScan, error: scanError } = await supabase
          .from('vulnerability_scans')
          .select('id, total_vulnerabilities')
          .eq('app_id', app.app_id)
          .eq('scan_status', 'completed')
          .order('completed_at', { ascending: false })
          .limit(1)
          .single();

        if (scanError && scanError.code !== 'PGRST116') {
          console.error('Error fetching vulnerability count:', scanError);
          return;
        }

        setVulnerabilityCount(latestScan?.total_vulnerabilities || 0);
      } catch (error) {
        console.error('Failed to fetch vulnerability count:', error);
      }
    };

    fetchEnvironmentErrorCounts();
    fetchVulnerabilityCount();
  }, [app.app_id, app.environments]);

  // Real-time subscription for environment error counts
  useEffect(() => {
    if (!app.app_id) return;

    console.log('Setting up real-time subscription for app:', app.app_id);
    console.log('Available environments:', app.environments.map(env => ({ 
      id: env.environment_id || env.id, 
      name: env.environment_name 
    })));

    const channel = supabase
      .channel(`app-logs-${app.app_id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mendix_logs',
          filter: `app_id=eq.${app.app_id}`
        },
        (payload) => {
          const newLog = payload.new as any;
          console.log('Received new log:', { 
            environment: newLog.environment, 
            level: newLog.level,
            app_id: newLog.app_id 
          });
          
          if (newLog.level === 'Error' || newLog.level === 'Critical') {
            // Find the matching environment by name using case-insensitive comparison
            const matchingEnv = app.environments.find(env => 
              env.environment_name.toLowerCase() === newLog.environment.toLowerCase()
            );
            
            if (matchingEnv) {
              const envKey = matchingEnv.environment_name;
              console.log('Updating error count for environment:', envKey);
              
              setEnvironmentErrorCounts(prev => {
                const newCounts = {
                  ...prev,
                  [envKey]: (prev[envKey] || 0) + 1
                };
                console.log('Updated environment error counts:', newCounts);
                return newCounts;
              });
              
              // Auto-expand the environment if it has new errors
              const envCollapseKey = matchingEnv.environment_id || matchingEnv.id;
              setCollapsedEnvironments(prev => ({
                ...prev,
                [envCollapseKey]: false
              }));
            } else {
              console.warn('No matching environment found for log environment:', newLog.environment);
              console.warn('Available environment names:', app.environments.map(env => env.environment_name));
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
      });

    return () => {
      console.log('Cleaning up subscription for app:', app.app_id);
      supabase.removeChannel(channel);
    };
  }, [app.app_id, app.environments]);

  const fetchWebhookLogsForEnvironment = async (environmentName: string) => {
    if (!app.app_id) return;
    
    setWebhookLoading(true);
    try {
      const logs = await fetchWebhookLogs(app.app_id, environmentName);
      setWebhookLogs(logs);
    } catch (error) {
      console.error('Error fetching webhook logs:', error);
      setWebhookLogs([]);
    } finally {
      setWebhookLoading(false);
    }
  };

  const handleGetMicroflows = async () => {
    try {
      // Find credential that has this app
      const { data: credentials } = await supabase
        .from('mendix_credentials')
        .select('*')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id);

      if (!credentials || credentials.length === 0) {
        throw new Error('No Mendix credentials found');
      }

      // Use the first credential that has this app (assuming one credential per app for now)
      const credential = credentials[0];

      setMicroflowsLoading(true);
      setMicroflowsDialogOpen(true);
      setMicroflowsData(null);

      const data = await getMicroflows(credential.id, app.app_id);
      setMicroflowsData(data);

    } catch (error) {
      console.error('Error getting microflows:', error);
      setMicroflowsDialogOpen(false);
    } finally {
      setMicroflowsLoading(false);
    }
  };

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

  const handleVulnerabilityTileClick = () => {
    setShowVulnerabilityResults(true);
    setVulnerabilityScanOpen(true);
    // Set the first environment as default for scanning context
    if (app.environments && app.environments.length > 0) {
      setSelectedEnvironmentForScan({ 
        name: app.environments[0].environment_name, 
        appId: app.app_id || '' 
      });
    }
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
            <HoverCard>
              <HoverCardTrigger asChild>
                <h3 className="font-semibold text-lg truncate group-hover:text-primary transition-colors cursor-pointer">
                  {app.app_name}
                </h3>
              </HoverCardTrigger>
              <HoverCardContent className="w-80">
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">Application Details</h4>
                  
                  {/* App ID */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">App ID</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => handleCopy(app.app_id || 'N/A', 'App ID')}
                      >
                        {copiedField === 'App ID' ? (
                          <Check className="w-3 h-3 text-green-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                    <p className="text-sm font-mono bg-muted px-2 py-1 rounded text-wrap break-all">
                      {app.app_id || 'Not available'}
                    </p>
                  </div>

                  {/* Project ID */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Project ID</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => handleCopy(app.project_id || 'N/A', 'Project ID')}
                      >
                        {copiedField === 'Project ID' ? (
                          <Check className="w-3 h-3 text-green-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                    <p className="text-sm font-mono bg-muted px-2 py-1 rounded text-wrap break-all">
                      {app.project_id || 'Not available'}
                    </p>
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Vulnerability Summary Tile */}
        <div 
          className="mb-4 p-3 rounded-lg border cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={handleVulnerabilityTileClick}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className={cn(
                "w-4 h-4",
                vulnerabilityCount > 0 ? "text-destructive" : "text-green-600"
              )} />
              <span className="text-sm font-medium">Vulnerabilities</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge 
                variant={vulnerabilityCount > 0 ? "destructive" : "secondary"}
                className="text-xs"
              >
                {vulnerabilityCount} Vulnerable
              </Badge>
              <ExternalLink className="w-3 h-3 text-muted-foreground" />
            </div>
          </div>
        </div>

        {app.environments && app.environments.length > 0 && (
          <div className="space-y-2">
            {sortEnvironments(app.environments).map((env) => {
              const envErrorCount = environmentErrorCounts[env.environment_name] || 0;
              const statusInfo = statusConfig[getEnvironmentStatus(env)?.toLowerCase() === 'running' ? 'healthy' : getEnvironmentStatus(env)?.toLowerCase() === 'stopped' ? 'error' : 'warning'] || statusConfig.offline;
              const StatusIcon = statusInfo.icon;
              const envColorClass = environmentColors[env.environment_name.toLowerCase() as keyof typeof environmentColors] || "bg-muted/50 border-muted/30";
              const isCollapsed = collapsedEnvironments[env.id] !== false;
              
              return (
                <Collapsible 
                  key={env.id} 
                  open={!isCollapsed}
                  onOpenChange={(open) => setCollapsedEnvironments(prev => ({ ...prev, [env.id]: !open }))}
                >
                  <div className={cn("border rounded-lg overflow-hidden", envColorClass)}>
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center justify-between p-3 hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-3">
                           <div className="flex items-center gap-2">
                             <span className="text-sm font-semibold">{capitalizeEnvironmentName(env.environment_name)}</span>
                             {env.model_version && (
                               <Badge variant="secondary" className="text-xs px-2 py-0">
                                 v{env.model_version}
                               </Badge>
                             )}
                           </div>
                          
                          {/* Show either error count or health status */}
                          {envErrorCount > 0 ? (
                            <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-destructive/20 text-destructive">
                              <AlertTriangle className="w-3 h-3" />
                              <span className="text-xs font-medium">{envErrorCount} errors</span>
                            </div>
                          ) : (
                            <div className={cn(
                              "flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium",
                              getEnvironmentStatus(env)?.toLowerCase() === 'running' ? "bg-green-500/20 text-green-700" : 
                              getEnvironmentStatus(env)?.toLowerCase() === 'stopped' ? "bg-red-500/20 text-red-700" : 
                              "bg-yellow-500/20 text-yellow-700"
                            )}>
                              <StatusIcon className="w-3 h-3" />
                              {getEnvironmentStatus(env)?.toLowerCase() === 'running' ? 'Running' : 
                               getEnvironmentStatus(env)?.toLowerCase() === 'stopped' ? 'Stopped' : 'Unknown'}
                            </div>
                          )}
                          
                          {isEnvironmentLoading(env) && (
                            <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {env.url && (
                            <ExternalLink 
                              className="h-4 w-4 text-muted-foreground hover:text-primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(env.url, '_blank');
                              }}
                            />
                          )}
                          <ChevronDown className={cn(
                            "h-4 w-4 text-muted-foreground transition-transform", 
                            isCollapsed && "rotate-180"
                          )} />
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent>
                      <div className="px-3 pb-3 border-t bg-background/50">
                        <div className="pt-3 space-y-2">
                          {/* Environment details */}
                          <div className="text-xs text-muted-foreground space-y-1">
                            {env.runtime_version && (
                              <p>Runtime: v{env.runtime_version}</p>
                            )}
                            <p>Status: {getEnvironmentStatus(env) || 'Unknown'}</p>
                          </div>
                          
                          {/* Action buttons */}
                          <div className="flex flex-wrap gap-2 pt-2">
                            {/* Only show start/stop buttons for non-production environments */}
                            {env.environment_name.toLowerCase() !== 'production' && (
                              <>
                                {getEnvironmentStatus(env)?.toLowerCase() === 'stopped' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8"
                                    disabled={loading || isEnvironmentLoading(env)}
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        const envKey = env.environment_id || env.id;
                                        setEnvironmentStatuses(prev => ({ 
                                          ...prev, 
                                          [envKey]: { status: 'starting...', loading: true } 
                                        }));
                                        
                                        await startEnvironment(app.app_id, env.environment_name);
                                        await handleRefreshEnvironment(env);
                                      } catch (error) {
                                        const envKey = env.environment_id || env.id;
                                        setEnvironmentStatuses(prev => ({ 
                                          ...prev, 
                                          [envKey]: { status: env.status, loading: false } 
                                        }));
                                      }
                                    }}
                                  >
                                    {loading || isEnvironmentLoading(env) ? (
                                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                    ) : (
                                      <CheckCircle className="w-3 h-3 mr-1" />
                                    )}
                                    Start Environment
                                  </Button>
                                )}
                                
                                {getEnvironmentStatus(env)?.toLowerCase() === 'running' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8"
                                    disabled={loading || isEnvironmentLoading(env)}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPendingStopEnv({ id: env.environment_id, name: env.environment_name, appId: app.app_id });
                                      setStopDialogOpen(true);
                                    }}
                                  >
                                    <XCircle className="w-3 h-3 mr-1" />
                                    Stop Environment
                                  </Button>
                                )}
                              </>
                            )}
                            
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8"
                              disabled={loading || isEnvironmentLoading(env)}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRefreshEnvironment(env);
                              }}
                            >
                              <RefreshCw className="w-3 h-3 mr-1" />
                              Refresh Status
                            </Button>
                            
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8"
                              disabled={loading}
                              onClick={async (e) => {
                                e.stopPropagation();
                                setLogsEnvironment({ name: env.environment_name, id: env.environment_id, appId: app.app_id });
                                setLogs("");
                                await fetchWebhookLogsForEnvironment(env.environment_name);
                                setLogsOpen(true);
                              }}
                            >
                              {loading ? (
                                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                              ) : (
                                <FileText className="w-3 h-3 mr-1" />
                              )}
                              View Logs
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8"
                              disabled={microflowsLoading}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleGetMicroflows();
                              }}
                            >
                              {microflowsLoading ? (
                                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                              ) : (
                                <Code className="w-3 h-3 mr-1" />
                              )}
                              Get Microflows
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8"
                               onClick={(e) => {
                                 e.stopPropagation();
                                 setSelectedEnvironmentForScan({ 
                                   name: env.environment_name, 
                                   appId: app.app_id || '' 
                                 });
                                 setShowVulnerabilityResults(false);
                                 setVulnerabilityScanOpen(true);
                               }}
                            >
                              <Shield className="w-3 h-3 mr-1" />
                              Scan Vulnerabilities
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
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
            setWebhookLogs([]);
          }}
          logs={logs}
          webhookLogs={webhookLogs}
          environmentName={logsEnvironment.name}
          appName={app.app_name}
          appId={logsEnvironment.appId}
          loading={loading}
          webhookLoading={webhookLoading}
          onRefreshWebhookLogs={() => fetchWebhookLogsForEnvironment(logsEnvironment.name)}
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

      {/* Microflows Dialog */}
      <MicroflowsDialog
        open={microflowsDialogOpen}
        onOpenChange={setMicroflowsDialogOpen}
        microflowsData={microflowsData}
        loading={microflowsLoading}
        appName={app.app_name}
      />

      {/* Vulnerability Scan Dialog */}
      {selectedEnvironmentForScan && (
        <VulnerabilityScanDialog
          isOpen={vulnerabilityScanOpen}
          onClose={() => {
            setVulnerabilityScanOpen(false);
            setSelectedEnvironmentForScan(null);
            setShowVulnerabilityResults(false);
          }}
          appId={selectedEnvironmentForScan.appId}
          environmentName={selectedEnvironmentForScan.name}
          appName={app.app_name}
          showResultsOnOpen={showVulnerabilityResults}
        />
      )}
    </Card>
  );
};

export default AppCard;