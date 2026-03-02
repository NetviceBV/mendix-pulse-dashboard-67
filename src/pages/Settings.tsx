import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MendixCredentials, { MendixCredential } from "@/components/MendixCredentials";
import { WebhookManagement } from "@/components/WebhookManagement";
import LogMonitoringSettings from "@/components/LogMonitoringSettings";
import EmailManagement from "@/components/EmailManagement";
import { EmailTemplates } from "@/components/EmailTemplates";
import { OWASPSettings } from "@/components/OWASPSettings";
import { OWASPRunsHistory } from "@/components/OWASPRunsHistory";
import LintingSettings from "@/components/LintingSettings";
import GeneralSettings from "@/components/GeneralSettings";
import { ArrowLeft, Settings as SettingsIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User as SupabaseUser } from '@supabase/supabase-js';
import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";
import { useInactivitySettings } from "@/hooks/useInactivitySettings";
import { toast } from "@/hooks/use-toast";

const Settings = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mendixCredentials, setMendixCredentials] = useState<MendixCredential[]>([]);
  const navigate = useNavigate();

  // Check authentication status
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        navigate("/");
      } else {
        setUser(user);
        setLoading(false);
      }
    });
  }, [navigate]);

  // Credentials are managed by MendixCredentials component via Supabase
  // State is kept here only for prop drilling
  const handleCredentialsChange = (credentials: MendixCredential[]) => {
    setMendixCredentials(credentials);
  };

  const handleSignOut = useCallback(async () => {
    sessionStorage.removeItem('mendix-apps-synced');
    await supabase.auth.signOut();
    navigate("/");
  }, [navigate]);

  const { timeoutMinutes } = useInactivitySettings();

  const handleInactivityWarning = useCallback(() => {
    toast({
      title: "Session expiring soon",
      description: "You will be logged out in 1 minute due to inactivity.",
    });
  }, []);

  const handleInactivityTimeout = useCallback(() => {
    toast({
      title: "Session expired",
      description: "You have been logged out due to inactivity.",
    });
    handleSignOut();
  }, [handleSignOut]);

  useInactivityTimeout({
    timeoutMs: timeoutMinutes * 60000,
    warningMs: 60000,
    onWarning: handleInactivityWarning,
    onTimeout: handleInactivityTimeout,
    enabled: !!user,
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/")}
                className="gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Dashboard
              </Button>
              <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
                <SettingsIcon className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Settings</h1>
                <p className="text-sm text-muted-foreground">
                  Manage your Mendix credentials and configuration
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="max-w-4xl mx-auto">
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="flex flex-wrap h-auto gap-1 p-1 w-full">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="credentials">Mendix Credentials</TabsTrigger>
                <TabsTrigger value="webhooks">Webhook Settings</TabsTrigger>
                <TabsTrigger value="emails">Email Management</TabsTrigger>
                <TabsTrigger value="templates">Email Templates</TabsTrigger>
                <TabsTrigger value="monitoring">Log Monitoring</TabsTrigger>
                <TabsTrigger value="owasp">OWASP Security</TabsTrigger>
                <TabsTrigger value="owasp-history">OWASP History</TabsTrigger>
                <TabsTrigger value="linting">Linting Rules</TabsTrigger>
              </TabsList>
            
            <TabsContent value="general" className="mt-6">
              <GeneralSettings />
            </TabsContent>

            <TabsContent value="credentials" className="mt-6">
              <MendixCredentials 
                credentials={mendixCredentials}
                onCredentialsChange={handleCredentialsChange}
              />
            </TabsContent>
            
            <TabsContent value="webhooks" className="mt-6">
              <WebhookManagement />
            </TabsContent>
            
            <TabsContent value="emails" className="mt-6">
              <EmailManagement />
            </TabsContent>
            
            <TabsContent value="templates" className="mt-6">
              <EmailTemplates />
            </TabsContent>
            
            <TabsContent value="monitoring" className="mt-6">
              <LogMonitoringSettings />
            </TabsContent>
            
            <TabsContent value="owasp" className="mt-6">
              <OWASPSettings />
            </TabsContent>
            
            <TabsContent value="owasp-history" className="mt-6">
              <OWASPRunsHistory />
            </TabsContent>
            
            <TabsContent value="linting" className="mt-6">
              <LintingSettings />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default Settings;