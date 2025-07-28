import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  ExternalLink,
  Clock,
  Users,
  Code
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface MendixEnvironment {
  id: string;
  environment_name: string;
  status: string;
  url?: string;
  model_version?: string;
  runtime_version?: string;
}

export interface MendixApp {
  id: string;
  name: string;
  description: string;
  status: "healthy" | "warning" | "error" | "offline";
  environment: "production" | "acceptance" | "test";
  lastDeployed: string;
  version: string;
  activeUsers: number;
  errorCount: number;
  url?: string;
  environments?: MendixEnvironment[];
}

interface AppCardProps {
  app: MendixApp;
  onOpenApp: (app: MendixApp) => void;
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

const AppCard = ({ app, onOpenApp }: AppCardProps) => {
  const statusInfo = statusConfig[app.status] || statusConfig.offline;
  const StatusIcon = statusInfo.icon;

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
              {app.name}
            </h3>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {app.description}
            </p>
          </div>
          
          <div className="flex items-center gap-2 ml-4">
            <div className="flex items-center gap-1">
              <Badge 
                variant="secondary" 
                className={cn("capitalize", environmentColors[app.environment])}
              >
                {app.environment}
              </Badge>
              {app.environments && app.environments.length > 1 && (
                <span className="text-xs text-muted-foreground">
                  +{app.environments.length - 1}
                </span>
              )}
            </div>
            
            <div className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium",
              statusInfo.gradient,
              app.status === "warning" ? "text-warning-foreground" : "text-white"
            )}>
              <StatusIcon className="w-3 h-3" />
              {statusInfo.text}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="flex items-center gap-2 text-sm">
            <Code className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">v{app.version}</span>
          </div>
          
          <div className="flex items-center gap-2 text-sm">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">{app.activeUsers} users</span>
          </div>
          
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">{app.lastDeployed}</span>
          </div>
          
          {app.errorCount > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="w-4 h-4 text-error" />
              <span className="text-error font-medium">{app.errorCount} errors</span>
            </div>
          )}
        </div>

        {app.environments && app.environments.length > 0 && (
          <div className="space-y-2 mb-4">
            <h4 className="text-sm font-medium text-muted-foreground">Environments</h4>
            <div className="grid gap-2">
              {app.environments.slice(0, 3).map((env) => (
                <div key={env.id} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      env.status === 'running' ? 'bg-success' : 
                      env.status === 'stopped' ? 'bg-error' : 'bg-warning'
                    )} />
                    <span className="text-sm font-medium">{env.environment_name}</span>
                    {env.model_version && (
                      <span className="text-xs text-muted-foreground">v{env.model_version}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Only show start/stop buttons for non-production environments */}
                    {env.environment_name.toLowerCase() !== 'production' && (
                      <div className="flex gap-1">
                        {env.status === 'stopped' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              // TODO: Implement start environment functionality
                              console.log('Start environment:', env.id);
                            }}
                          >
                            Start
                          </Button>
                        )}
                        {env.status === 'running' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              // TODO: Implement stop environment functionality
                              console.log('Stop environment:', env.id);
                            }}
                          >
                            Stop
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            // TODO: Implement download logs functionality
                            console.log('Download logs for environment:', env.id);
                          }}
                        >
                          Logs
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
              ))}
              {app.environments.length > 3 && (
                <div className="text-xs text-muted-foreground text-center">
                  +{app.environments.length - 3} more environments
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={() => onOpenApp(app)}
            className="flex-1 bg-gradient-primary hover:opacity-90 transition-opacity"
            size="sm"
          >
            <Activity className="w-4 h-4 mr-2" />
            View Details
          </Button>
          
          {app.url && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                window.open(app.url, '_blank');
              }}
            >
              <ExternalLink className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default AppCard;