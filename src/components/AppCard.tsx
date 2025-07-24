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
  const statusInfo = statusConfig[app.status];
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
            <Badge 
              variant="secondary" 
              className={cn("capitalize", environmentColors[app.environment])}
            >
              {app.environment}
            </Badge>
            
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