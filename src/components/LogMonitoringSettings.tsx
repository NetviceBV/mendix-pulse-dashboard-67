import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Mail, Clock, AlertTriangle, Eye } from "lucide-react";

interface Environment {
  id: string;
  environment_name: string;
  app_id: string;
  app_name: string;
  status: string;
}

interface MonitoringSetting {
  id?: string;
  environment_id: string;
  is_enabled: boolean;
  email_address: string;
  check_interval_minutes: number;
  error_threshold: number;
  critical_threshold: number;
  last_check_time?: string;
}

const LogMonitoringSettings = () => {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [settings, setSettings] = useState<Record<string, MonitoringSetting>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load environments
      const { data: envData, error: envError } = await supabase
        .from('mendix_environments')
        .select('id, environment_name, app_id, status')
        .order('environment_name');

      if (envError) throw envError;

      // Load apps to get app names
      const { data: appsData, error: appsError } = await supabase
        .from('mendix_apps')
        .select('app_id, app_name');

      if (appsError) throw appsError;

      // Load existing monitoring settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('log_monitoring_settings')
        .select('*');

      if (settingsError) throw settingsError;

      // Create app lookup map
      const appLookup = (appsData || []).reduce((acc, app) => {
        acc[app.app_id] = app.app_name;
        return acc;
      }, {} as Record<string, string>);

      // Transform the data to include app names and sort by app name then environment name
      const transformedEnvData = (envData || [])
        .map(env => ({
          ...env,
          app_name: appLookup[env.app_id] || 'Unknown App'
        }))
        .sort((a, b) => {
          const appCompare = a.app_name.localeCompare(b.app_name);
          if (appCompare !== 0) return appCompare;
          return a.environment_name.localeCompare(b.environment_name);
        });

      setEnvironments(transformedEnvData);

      // Create settings map
      const settingsMap: Record<string, MonitoringSetting> = {};
      transformedEnvData.forEach((env) => {
        const existing = settingsData?.find(s => s.environment_id === env.id);
        settingsMap[env.id] = existing || {
          environment_id: env.id,
          is_enabled: false,
          email_address: "",
          check_interval_minutes: 30,
          error_threshold: 1,
          critical_threshold: 1
        };
      });

      setSettings(settingsMap);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: "Error",
        description: "Failed to load monitoring settings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = (envId: string, updates: Partial<MonitoringSetting>) => {
    setSettings(prev => ({
      ...prev,
      [envId]: { ...prev[envId], ...updates }
    }));
  };

  const saveSetting = async (envId: string) => {
    setSaving(true);
    try {
      const setting = settings[envId];
      
      if (setting.id) {
        // Update existing
        const { error } = await supabase
          .from('log_monitoring_settings')
          .update({
            is_enabled: setting.is_enabled,
            email_address: setting.email_address,
            check_interval_minutes: setting.check_interval_minutes,
            error_threshold: setting.error_threshold,
            critical_threshold: setting.critical_threshold,
          })
          .eq('id', setting.id);

        if (error) throw error;
      } else if (setting.is_enabled) {
        // Create new
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        const { data, error } = await supabase
          .from('log_monitoring_settings')
          .insert({
            user_id: user.id,
            environment_id: setting.environment_id,
            is_enabled: setting.is_enabled,
            email_address: setting.email_address,
            check_interval_minutes: setting.check_interval_minutes,
            error_threshold: setting.error_threshold,
            critical_threshold: setting.critical_threshold,
          })
          .select()
          .single();

        if (error) throw error;
        
        updateSetting(envId, { id: data.id });
      }

      toast({
        title: "Success",
        description: "Monitoring settings saved",
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: "Error",
        description: "Failed to save monitoring settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Log Monitoring</h2>
        <p className="text-muted-foreground">
          Configure automated monitoring for error and critical log entries in your environments
        </p>
      </div>

      <div className="space-y-8">
        {Object.entries(
          environments.reduce((acc, env) => {
            const appName = env.app_name;
            if (!acc[appName]) acc[appName] = [];
            acc[appName].push(env);
            return acc;
          }, {} as Record<string, Environment[]>)
        ).map(([appName, appEnvironments]) => (
          <div key={appName} className="space-y-4">
            <div className="border-b border-border pb-2">
              <h3 className="text-xl font-semibold text-foreground">{appName}</h3>
              <p className="text-sm text-muted-foreground">
                {appEnvironments.length} environment{appEnvironments.length !== 1 ? 's' : ''}
              </p>
            </div>
            
            <div className="grid gap-4 pl-4">
              {appEnvironments.map((env) => {
                const setting = settings[env.id];
                if (!setting) return null;

                return (
                  <Card key={env.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">{env.environment_name}</CardTitle>
                          <CardDescription>
                            Status: {env.status}
                            {setting.last_check_time && (
                              <span className="ml-2 text-xs">
                                Last checked: {new Date(setting.last_check_time).toLocaleString()}
                              </span>
                            )}
                          </CardDescription>
                        </div>
                        <Switch
                          checked={setting.is_enabled}
                          onCheckedChange={(checked) => updateSetting(env.id, { is_enabled: checked })}
                        />
                      </div>
                    </CardHeader>

                    {setting.is_enabled && (
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor={`email-${env.id}`}>
                              <Mail className="w-4 h-4 inline mr-2" />
                              Alert Email Address
                            </Label>
                            <Input
                              id={`email-${env.id}`}
                              type="email"
                              value={setting.email_address}
                              onChange={(e) => updateSetting(env.id, { email_address: e.target.value })}
                              placeholder="Enter email address for alerts"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>
                              <Clock className="w-4 h-4 inline mr-2" />
                              Check Interval
                            </Label>
                            <Select
                              value={setting.check_interval_minutes.toString()}
                              onValueChange={(value) => updateSetting(env.id, { check_interval_minutes: parseInt(value) })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="15">Every 15 minutes</SelectItem>
                                <SelectItem value="30">Every 30 minutes</SelectItem>
                                <SelectItem value="60">Every hour</SelectItem>
                                <SelectItem value="120">Every 2 hours</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label>
                              <AlertTriangle className="w-4 h-4 inline mr-2" />
                              Error Threshold
                            </Label>
                            <Input
                              type="number"
                              min="1"
                              value={setting.error_threshold}
                              onChange={(e) => updateSetting(env.id, { error_threshold: parseInt(e.target.value) || 1 })}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>
                              <Eye className="w-4 h-4 inline mr-2" />
                              Critical Threshold
                            </Label>
                            <Input
                              type="number"
                              min="1"
                              value={setting.critical_threshold}
                              onChange={(e) => updateSetting(env.id, { critical_threshold: parseInt(e.target.value) || 1 })}
                            />
                          </div>
                        </div>

                        <div className="flex justify-end pt-4">
                          <Button 
                            onClick={() => saveSetting(env.id)}
                            disabled={saving || !setting.email_address}
                          >
                            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Save Settings
                          </Button>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {environments.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">
              No environments found. Please add Mendix credentials and fetch your applications first.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default LogMonitoringSettings;