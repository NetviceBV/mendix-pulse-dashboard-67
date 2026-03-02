import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryClient } from "@tanstack/react-query";

import AppCard, { MendixApp } from "@/components/AppCard";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { useAppsQuery } from "@/hooks/useAppsQuery";
import { queryKeys } from "@/lib/queryKeys";
import { 
  Search, 
  RefreshCw, 
  Settings, 
  LogOut,
  Activity,
  CloudCog
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useBrandLogo } from "@/hooks/useBrandLogo";

interface DashboardProps {
  onSignOut: () => void;
}

const Dashboard = ({ onSignOut }: DashboardProps) => {
  const brand = useBrandLogo();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("production");
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Use React Query for data fetching
  const { data: apps = [], isLoading, refetch, isRefetching } = useAppsQuery();

  // Helper functions to categorize apps
  const isSandboxOnlyApp = (app: MendixApp) => {
    return app.environments && app.environments.length > 0 && 
           app.environments.every(env => env.environment_name.toLowerCase().includes('sandbox'));
  };

  const hasNonSandboxEnvironments = (app: MendixApp) => {
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

  const filteredApps = getFilteredApps();
  const productionApps = apps.filter(app => hasNonSandboxEnvironments(app));
  const sandboxApps = apps.filter(app => isSandboxOnlyApp(app));

  // Set up real-time subscriptions that invalidate React Query cache
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
        () => {
          // Invalidate cache to trigger refetch
          queryClient.invalidateQueries({ queryKey: queryKeys.appsWithEnvironments });
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
  }, [queryClient, toast]);

  // Manual refresh with toast feedback
  const refreshApps = async () => {
    await refetch();
    toast({
      title: "Applications refreshed",
      description: "Latest status updates have been loaded"
    });
  };

  const handleOpenApp = (app: MendixApp) => {
    toast({
      title: `Opening ${app.app_name}`,
      description: "Loading application details..."
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {brand ? (
                  <img src={brand.logo} alt={`${brand.name} logo`} className="h-8 w-auto object-contain" />
                ) : (
                  <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
                    <Activity className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
                <div>
                  <h1 className="text-xl font-bold">Mendix Dashboard</h1>
                  <p className="text-sm text-muted-foreground">
                    Manage your Mendix applications
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>
        
        <div className="container mx-auto px-4 py-6">
          <DashboardSkeleton />
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
              {brand ? (
                <img src={brand.logo} alt={`${brand.name} logo`} className="h-8 w-auto object-contain" />
              ) : (
                <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
                  <Activity className="w-4 h-4 text-primary-foreground" />
                </div>
              )}
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
                disabled={isRefetching}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => navigate("/cloud-actions")}
              >
                <CloudCog className="w-4 h-4 mr-2" />
                Cloud Actions
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
                  <h3 className="text-lg font-medium mb-2">No production applications found</h3>
                  <p className="text-muted-foreground">
                    {searchTerm ? "Try adjusting your search criteria" : "No applications with production environments"}
                  </p>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="sandbox" className="space-y-6">
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
                  <h3 className="text-lg font-medium mb-2">No sandbox applications found</h3>
                  <p className="text-muted-foreground">
                    {searchTerm ? "Try adjusting your search criteria" : "No sandbox-only applications"}
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
