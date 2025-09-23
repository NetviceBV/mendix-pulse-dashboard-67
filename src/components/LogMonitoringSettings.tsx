import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Mail, Clock, AlertTriangle, Eye, Search } from "lucide-react";

interface Environment {
  id: string;
  environment_name: string;
  app_id: string;
  app_name: string;
  status: string;
}

interface AppWithEnvironments {
  id: string;
  app_name: string;
  project_id: string;
  status: string;
  environments: Environment[];
}

interface MonitoringSetting {
  id?: string;
  environment_id: string;
  is_enabled: boolean;
  check_interval_minutes: number;
  error_threshold: number;
  critical_threshold: number;
  last_check_time?: string;
}

const LogMonitoringSettings = () => {
  const [apps, setApps] = useState<AppWithEnvironments[]>([]);
  const [filteredApps, setFilteredApps] = useState<AppWithEnvironments[]>([]);
  const [settings, setSettings] = useState<Record<string, MonitoringSetting>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("production");
  const { toast } = useToast();

  // Helper functions to categorize apps
  const isSandboxOnlyApp = (app: AppWithEnvironments) => {
    return app.environments && app.environments.length > 0 && 
           app.environments.every(env => env.environment_name.toLowerCase().includes('sandbox'));
  };

  const hasNonSandboxEnvironments = (app: AppWithEnvironments) => {
    return app.environments && app.environments.some(env => 
      !env.environment_name.toLowerCase().includes('sandbox')
    );
  };

  // Filter apps based on tab and search
  const getFilteredApps = () => {
    let filtered = apps;

    // Filter by tab
    if (activeTab === "production") {
      filtered = filtered.filter(app => hasNonSandboxEnvironments(app));
    } else {
      filtered = filtered.filter(app => isSandboxOnlyApp(app));
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(app => 
        app.app_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return filtered;
  };

  const productionApps = apps.filter(app => hasNonSandboxEnvironments(app));
  const sandboxApps = apps.filter(app => isSandboxOnlyApp(app));

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setFilteredApps(getFilteredApps());
  }, [apps, searchTerm, activeTab]);

  const loadData = async () => {
    try {
      // Load apps first
      const { data: appsData, error: appsError } = await supabase
        .from('mendix_apps')
        .select('id, app_name, project_id, status')
        .order('created_at', { ascending: false });

      if (appsError) throw appsError;

      // Fetch environments for each app using project_id
      const appsWithEnvironments = await Promise.all((appsData || []).map(async (app) => {
        const { data: environments, error: envError } = await supabase
          .from('mendix_environments')
          .select('id, environment_name, app_id, status')
          .eq('app_id', app.project_id);

        return {
          ...app,
          environments: envError ? [] : (environments || []).map(env => ({
            ...env,
            app_name: app.app_name
          }))
        };
      }));

      // Load existing monitoring settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('log_monitoring_settings')
        .select('*');

      if (settingsError) throw settingsError;

      setApps(appsWithEnvironments);

      // Create settings map for all environments
      const settingsMap: Record<string, MonitoringSetting> = {};
      appsWithEnvironments.forEach((app) => {
        app.environments.forEach((env) => {
          const existing = settingsData?.find(s => s.environment_id === env.id);
          settingsMap[env.id] = existing || {
            environment_id: env.id,
            is_enabled: false,
            check_interval_minutes: 30,
            error_threshold: 1,
            critical_threshold: 1
          };
        });
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
            check_interval_minutes: setting.check_interval_minutes,
            error_threshold: setting.error_threshold,
            critical_threshold: setting.critical_threshold,
          })
          .eq('id', setting.id);

        if (error) throw error;
      } else {
        // Create new (regardless of enabled status)
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        const { data, error } = await supabase
          .from('log_monitoring_settings')
          .insert({
            user_id: user.id,
            environment_id: setting.environment_id,
            is_enabled: setting.is_enabled,
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

  const renderAppCard = (app: AppWithEnvironments) => (
    <Card key={app.id} className="space-y-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl">{app.app_name}</CardTitle>
            <CardDescription>
              {app.environments.length} environment{app.environments.length !== 1 ? 's' : ''}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {app.environments.map((env) => {
          const setting = settings[env.id];
          if (!setting) return null;

          return (
            <div key={env.id} className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">{env.environment_name}</h4>
                  <p className="text-sm text-muted-foreground">
                    Status: {env.status}
                    {setting.last_check_time && (
                      <span className="ml-2">
                        Last checked: {new Date(setting.last_check_time).toLocaleString()}
                      </span>
                    )}
                  </p>
                </div>
                <Switch
                  checked={setting.is_enabled}
                  onCheckedChange={(checked) => updateSetting(env.id, { is_enabled: checked })}
                />
              </div>

              {setting.is_enabled && (
                <div className="space-y-4 pt-4 border-t">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                  <div className="flex justify-end pt-2">
                    <Button 
                      onClick={() => saveSetting(env.id)}
                      disabled={saving}
                      size="sm"
                    >
                      {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Save Settings
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Log Monitoring</h2>
        <p className="text-muted-foreground">
          Configure automated monitoring for error and critical log entries in your environments
        </p>
      </div>

      {/* Email Management Info */}
      <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div>
              <p className="font-medium text-blue-900 dark:text-blue-100">
                Email Notifications
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                To receive email alerts for log monitoring events, configure your email addresses in the{" "}
                <strong>Email Management</strong> tab and enable "Log Monitoring Notifications" for the addresses that should receive alerts.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search applications..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Tabs for organizing apps */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="production">
            Production Apps ({productionApps.length})
          </TabsTrigger>
          <TabsTrigger value="sandbox">
            Sandbox Apps ({sandboxApps.length})
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="production" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredApps.map(renderAppCard)}
          </div>
          
          {filteredApps.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-2">No production applications found</h3>
                <p className="text-muted-foreground">
                  {searchTerm ? "Try adjusting your search criteria" : "No applications with production environments"}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        <TabsContent value="sandbox" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredApps.map(renderAppCard)}
          </div>
          
          {filteredApps.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-2">No sandbox applications found</h3>
                <p className="text-muted-foreground">
                  {searchTerm ? "Try adjusting your search criteria" : "No sandbox-only applications"}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {apps.length === 0 && !loading && (
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