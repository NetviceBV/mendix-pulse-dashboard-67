import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useCloudActionsSettings } from "@/hooks/useCloudActionsSettings";
import { Info, Zap, Clock, Shield } from "lucide-react";

const CloudActionsSettings = () => {
  const { version, setVersion, loading, isV2Enabled } = useCloudActionsSettings();

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              Cloud Actions Engine
              <Badge variant={isV2Enabled ? "default" : "secondary"}>
                {isV2Enabled ? "v2" : "v1"}
              </Badge>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center space-x-2">
            <Switch
              id="enhanced-actions"
              checked={isV2Enabled}
              onCheckedChange={(checked) => setVersion(checked ? 'v2' : 'v1')}
            />
            <Label htmlFor="enhanced-actions" className="text-sm font-medium">
              Use Enhanced Cloud Actions (v2)
            </Label>
          </div>

          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border bg-card/50">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <div className="w-6 h-6 bg-muted rounded-full flex items-center justify-center">
                    <span className="text-xs font-bold">v1</span>
                  </div>
                  Standard Engine
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Single-step execution</li>
                  <li>• 150-second timeout limit</li>
                  <li>• Basic error handling</li>
                  <li>• Simple status tracking</li>
                </ul>
              </div>

              <div className="p-4 rounded-lg border bg-primary/5 border-primary/20">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                    <Zap className="w-3 h-3 text-primary-foreground" />
                  </div>
                  Enhanced Engine (v2)
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li className="flex items-center gap-2">
                    <Clock className="w-3 h-3" />
                    No timeout limitations
                  </li>
                  <li className="flex items-center gap-2">
                    <Shield className="w-3 h-3" />
                    Automatic resume on failure
                  </li>
                  <li className="flex items-center gap-2">
                    <Info className="w-3 h-3" />
                    Step-by-step progress tracking
                  </li>
                  <li className="flex items-center gap-2">
                    <Zap className="w-3 h-3" />
                    Advanced error recovery
                  </li>
                </ul>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-muted/50 border">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-foreground mb-1">
                    {isV2Enabled ? "Enhanced Engine Active" : "Standard Engine Active"}
                  </p>
                  <p className="text-muted-foreground">
                    {isV2Enabled 
                      ? "You're using the new stateful cloud actions system with improved reliability and no timeout restrictions. Operations will automatically resume if interrupted."
                      : "You're using the standard cloud actions system. Switch to v2 for better reliability with long-running operations like deployments and transports."
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CloudActionsSettings;