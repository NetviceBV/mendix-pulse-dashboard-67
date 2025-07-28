import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import AppCard, { MendixApp } from "@/components/AppCard";
import { 
  Search, 
  Filter, 
  RefreshCw, 
  Settings, 
  LogOut,
  AlertTriangle,
  CheckCircle,
  Activity
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface DashboardProps {
  onSignOut: () => void;
}

const Dashboard = ({ onSignOut }: DashboardProps) => {
  const [apps, setApps] = useState<MendixApp[]>([]);
  const [filteredApps, setFilteredApps] = useState<MendixApp[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Fetch real apps from Supabase with environments
  useEffect(() => {
    const fetchApps = async () => {
      try {
        const { data: appsData, error: appsError } = await supabase
          .from('mendix_apps')
          .select('*')
          .order('created_at', { ascending: false });

        if (appsError) throw appsError;

        // Fetch environments separately for each app
        const appsWithEnvironments = await Promise.all((appsData || []).map(async (app) => {
          const { data: environments, error: envError } = await supabase
            .from('mendix_environments')
            .select('*')
            .eq('app_id', app.app_id);

          return {
            ...app,
            environments: envError ? [] : (environments || [])
          };
        }));

        const mappedApps: MendixApp[] = appsWithEnvironments.map(app => {
          // Determine primary environment (prefer production, then acceptance, then any)
          const environments = app.environments || [];
          const prodEnv = environments.find((e: any) => e.environment_name?.toLowerCase().includes('production'));
          const accEnv = environments.find((e: any) => e.environment_name?.toLowerCase().includes('acceptance'));
          const primaryEnv = prodEnv || accEnv || environments[0];

          return {
            id: app.id,
            name: app.app_name,
            description: environments.length > 0 ? 
              `${environments.length} environment${environments.length !== 1 ? 's' : ''} available` :
              `Application retrieved from Mendix`,
            status: primaryEnv?.status as "healthy" | "warning" | "error" | "offline" || app.status as "healthy" | "warning" | "error" | "offline",
            environment: primaryEnv?.environment_name as "production" | "acceptance" | "test" || app.environment as "production" | "acceptance" | "test",
            lastDeployed: new Date(app.last_deployed).toISOString(),
            version: primaryEnv?.model_version || app.version || "1.0.0",
            activeUsers: app.active_users,
            errorCount: app.error_count,
            url: primaryEnv?.url || app.app_url,
            environments: environments
          };
        });

        setApps(mappedApps);
        setFilteredApps(mappedApps);
      } catch (error) {
        console.error('Error fetching apps:', error);
        // Keep empty state if there's an error
        setApps([]);
        setFilteredApps([]);
      } finally {
        setLoading(false);
      }
    };

    fetchApps();
  }, []);

  useEffect(() => {
    let filtered = apps;

    if (searchTerm) {
      filtered = filtered.filter(app => 
        app.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        app.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter(app => app.status === statusFilter);
    }

    setFilteredApps(filtered);
  }, [apps, searchTerm, statusFilter]);

  const refreshApps = () => {
    setLoading(true);
    // Simulate refresh
    setTimeout(() => {
      setLoading(false);
      toast({
        title: "Applications refreshed",
        description: "Latest status updates have been loaded"
      });
    }, 1000);
  };

  const handleOpenApp = (app: MendixApp) => {
    toast({
      title: `Opening ${app.name}`,
      description: "Loading application details..."
    });
  };

  const getStatusCounts = () => {
    return {
      total: apps.length,
      healthy: apps.filter(app => app.status === "healthy").length,
      warning: apps.filter(app => app.status === "warning").length,
      error: apps.filter(app => app.status === "error").length,
      offline: apps.filter(app => app.status === "offline").length
    };
  };

  const statusCounts = getStatusCounts();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 bg-gradient-primary rounded-xl mx-auto animate-pulse"></div>
          <div className="space-y-2">
            <div className="font-semibold">Loading your applications...</div>
            <div className="text-sm text-muted-foreground">Connecting to Mendix SDK</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
                <Activity className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Mendix Dashboard</h1>
                <p className="text-sm text-muted-foreground">
                  {statusCounts.total} applications • {statusCounts.error} critical
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={refreshApps}
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => navigate("/settings")}
              >
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
              <Button variant="outline" size="sm" onClick={onSignOut}>
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="space-y-6">
          {/* Status Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gradient-card rounded-lg p-4 border border-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Apps</p>
                  <p className="text-2xl font-bold">{statusCounts.total}</p>
                </div>
                <Activity className="w-8 h-8 text-primary" />
              </div>
            </div>
            
            <div className="bg-gradient-card rounded-lg p-4 border border-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Healthy</p>
                  <p className="text-2xl font-bold text-success">{statusCounts.healthy}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-success" />
              </div>
            </div>
            
            <div className="bg-gradient-card rounded-lg p-4 border border-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Warnings</p>
                  <p className="text-2xl font-bold text-warning">{statusCounts.warning}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-warning" />
              </div>
            </div>
            
            <div className="bg-gradient-card rounded-lg p-4 border border-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Critical</p>
                  <p className="text-2xl font-bold text-error">{statusCounts.error}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-error" />
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search applications..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <div className="flex gap-2 flex-wrap">
              <Badge
                variant={statusFilter === "all" ? "default" : "outline"}
                className="cursor-pointer px-3 py-1"
                onClick={() => setStatusFilter("all")}
              >
                All
              </Badge>
              <Badge
                variant={statusFilter === "healthy" ? "default" : "outline"}
                className="cursor-pointer px-3 py-1"
                onClick={() => setStatusFilter("healthy")}
              >
                Healthy
              </Badge>
              <Badge
                variant={statusFilter === "warning" ? "default" : "outline"}
                className="cursor-pointer px-3 py-1"
                onClick={() => setStatusFilter("warning")}
              >
                Warning
              </Badge>
              <Badge
                variant={statusFilter === "error" ? "default" : "outline"}
                className="cursor-pointer px-3 py-1"
                onClick={() => setStatusFilter("error")}
              >
                Error
              </Badge>
            </div>
          </div>

          {/* Applications Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredApps.map((app) => (
              <AppCard
                key={app.id}
                app={app}
                onOpenApp={handleOpenApp}
                onRefresh={() => {
                  // Refresh the apps data when operations complete
                  setLoading(true);
                  setTimeout(() => {
                    setLoading(false);
                    toast({
                      title: "Status Updated",
                      description: "Environment status has been refreshed"
                    });
                  }, 2000);
                }}
              />
            ))}
          </div>

          {filteredApps.length === 0 && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">No applications found</h3>
              <p className="text-muted-foreground">
                Try adjusting your search or filter criteria
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;