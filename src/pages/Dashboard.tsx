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

  // Mock data - In real app, this would come from Mendix SDK
  const mockApps: MendixApp[] = [
    {
      id: "1",
      name: "Customer Portal",
      description: "Main customer-facing application for order management and support",
      status: "healthy",
      environment: "production",
      lastDeployed: "2h ago",
      version: "2.1.3",
      activeUsers: 234,
      errorCount: 0,
      url: "https://customer-portal.mendix.com"
    },
    {
      id: "2", 
      name: "Inventory System",
      description: "Internal inventory management and tracking system",
      status: "warning",
      environment: "production",
      lastDeployed: "1d ago",
      version: "1.8.2",
      activeUsers: 45,
      errorCount: 3,
      url: "https://inventory.mendix.com"
    },
    {
      id: "3",
      name: "HR Dashboard",
      description: "Employee management and HR processes automation",
      status: "error",
      environment: "production", 
      lastDeployed: "3d ago",
      version: "3.0.1",
      activeUsers: 12,
      errorCount: 15,
      url: "https://hr.mendix.com"
    },
    {
      id: "4",
      name: "Analytics Platform",
      description: "Business intelligence and reporting platform",
      status: "healthy",
      environment: "acceptance",
      lastDeployed: "4h ago",
      version: "1.5.0",
      activeUsers: 8,
      errorCount: 0
    },
    {
      id: "5",
      name: "Mobile App Backend",
      description: "API backend for mobile applications",
      status: "offline",
      environment: "test",
      lastDeployed: "1w ago",
      version: "0.9.5",
      activeUsers: 0,
      errorCount: 0
    }
  ];

  useEffect(() => {
    // Simulate loading apps from Mendix SDK
    setTimeout(() => {
      setApps(mockApps);
      setFilteredApps(mockApps);
      setLoading(false);
    }, 1500);
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
              <Button variant="outline" size="sm">
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
        {/* Status Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
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
  );
};

export default Dashboard;