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
  Activity,
  XCircle,
  Zap
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
  const [realtimeStats, setRealtimeStats] = useState({
    totalWarnings: 0,
    totalErrors: 0,
    recentLogs: 0
  });
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

        const mappedApps: MendixApp[] = appsWithEnvironments;

        setApps(mappedApps);
        setFilteredApps(mappedApps);
        
        // Fetch realtime stats
        await fetchRealtimeStats();
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

  // Fetch realtime statistics
  const fetchRealtimeStats = async () => {
    try {
      const { data: stats, error } = await supabase
        .from('mendix_logs')
        .select('level')
        .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (error) throw error;

      const warnings = stats?.filter(log => log.level === 'Warning').length || 0;
      const errors = stats?.filter(log => log.level === 'Error' || log.level === 'Critical').length || 0;
      
      setRealtimeStats({
        totalWarnings: warnings,
        totalErrors: errors,
        recentLogs: stats?.length || 0
      });
    } catch (error) {
      console.error('Error fetching realtime stats:', error);
    }
  };

  // Set up real-time subscriptions
  useEffect(() => {
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mendix_apps'
        },
        (payload) => {
          console.log('App update received:', payload);
          // Refresh apps when there are changes
          if (payload.eventType === 'UPDATE') {
            setApps(prevApps => 
              prevApps.map(app => 
                app.id === payload.new.id ? { ...app, ...payload.new } : app
              )
            );
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mendix_logs'
        },
        (payload) => {
          console.log('New log received:', payload);
          // Update realtime stats when new logs arrive
          fetchRealtimeStats();
          
          // Show toast for critical errors
          if (payload.new.level === 'Critical' || payload.new.level === 'Error') {
            toast({
              title: "Critical Error Detected",
              description: `${payload.new.app_id} - ${payload.new.environment}: ${payload.new.message}`,
              variant: "destructive"
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [toast]);

  useEffect(() => {
    let filtered = apps;

    if (searchTerm) {
      filtered = filtered.filter(app => 
        app.app_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter(app => app.status === statusFilter);
    }

    setFilteredApps(filtered);
  }, [apps, searchTerm, statusFilter]);

  const refreshApps = async () => {
    setLoading(true);
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

      const mappedApps: MendixApp[] = appsWithEnvironments;

      setApps(mappedApps);
      setFilteredApps(mappedApps);
      
      toast({
        title: "Applications refreshed",
        description: "Latest status updates have been loaded"
      });
    } catch (error) {
      console.error('Error refreshing apps:', error);
      toast({
        title: "Refresh failed",
        description: "Could not load latest application data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenApp = (app: MendixApp) => {
    toast({
      title: `Opening ${app.app_name}`,
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
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
                  <p className="text-sm text-muted-foreground">Warnings (24h)</p>
                  <p className="text-2xl font-bold text-warning">{realtimeStats.totalWarnings}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-warning" />
              </div>
            </div>
            
            <div className="bg-gradient-card rounded-lg p-4 border border-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Errors (24h)</p>
                  <p className="text-2xl font-bold text-error">{realtimeStats.totalErrors}</p>
                </div>
                <XCircle className="w-8 h-8 text-error" />
              </div>
            </div>
            
            <div className="bg-gradient-card rounded-lg p-4 border border-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Recent Logs</p>
                  <p className="text-2xl font-bold text-accent">{realtimeStats.recentLogs}</p>
                </div>
                <Zap className="w-8 h-8 text-accent" />
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
                onRefresh={refreshApps}
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