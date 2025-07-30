import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import AppCard, { MendixApp } from "@/components/AppCard";
import { 
  Search, 
  RefreshCw, 
  Settings, 
  LogOut,
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

        const mappedApps: MendixApp[] = appsWithEnvironments;

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

    setFilteredApps(filtered);
  }, [apps, searchTerm]);

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
                  Manage your Mendix applications
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