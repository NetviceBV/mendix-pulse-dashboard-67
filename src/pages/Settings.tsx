import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MendixCredentials, { MendixCredential } from "@/components/MendixCredentials";
import { WebhookManagement } from "@/components/WebhookManagement";
import { ArrowLeft, Settings as SettingsIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User as SupabaseUser } from '@supabase/supabase-js';

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

  // Load credentials from localStorage on mount
  useEffect(() => {
    const savedCredentials = localStorage.getItem('mendix-credentials');
    if (savedCredentials) {
      try {
        setMendixCredentials(JSON.parse(savedCredentials));
      } catch (error) {
        console.error('Failed to parse saved credentials:', error);
      }
    }
  }, []);

  // Save credentials to localStorage whenever they change
  const handleCredentialsChange = (credentials: MendixCredential[]) => {
    setMendixCredentials(credentials);
    localStorage.setItem('mendix-credentials', JSON.stringify(credentials));
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

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
          <Tabs defaultValue="credentials" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="credentials">Mendix Credentials</TabsTrigger>
              <TabsTrigger value="webhooks">Webhook Settings</TabsTrigger>
            </TabsList>
            
            <TabsContent value="credentials" className="mt-6">
              <MendixCredentials 
                credentials={mendixCredentials}
                onCredentialsChange={handleCredentialsChange}
              />
            </TabsContent>
            
            <TabsContent value="webhooks" className="mt-6">
              <WebhookManagement />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default Settings;