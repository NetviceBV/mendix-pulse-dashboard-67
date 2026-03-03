import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useInactivitySettings } from "@/hooks/useInactivitySettings";
import { toast } from "@/hooks/use-toast";
import { Clock, Save } from "lucide-react";

export default function GeneralSettings() {
  const { timeoutMinutes, isLoading, updateTimeout, isUpdating } = useInactivitySettings();
  const [localValue, setLocalValue] = useState(timeoutMinutes);

  useEffect(() => {
    setLocalValue(timeoutMinutes);
  }, [timeoutMinutes]);

  const handleSave = async () => {
    try {
      await updateTimeout(localValue);
      toast({
        title: "Settings saved",
        description: `Inactivity timeout set to ${localValue} minutes.`,
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to save settings.",
        variant: "destructive",
      });
    }
  };

  const hasChanges = localValue !== timeoutMinutes;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Session Settings
        </CardTitle>
        <CardDescription>
          Configure automatic logout after a period of inactivity. A warning will appear 1 minute before you are signed out.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Inactivity timeout</span>
            <span className="text-sm text-muted-foreground font-mono">
              {localValue} min
            </span>
          </div>
          <Slider
            value={[localValue]}
            onValueChange={([val]) => setLocalValue(val)}
            min={5}
            max={60}
            step={5}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>5 min</span>
            <span>60 min</span>
          </div>
        </div>

        <Button
          onClick={handleSave}
          disabled={!hasChanges || isUpdating}
          className="gap-2"
        >
          <Save className="w-4 h-4" />
          {isUpdating ? "Saving..." : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}
