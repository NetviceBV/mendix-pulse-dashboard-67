import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Key, User, Shield, Edit2, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface MendixCredential {
  id: string;
  name: string;
  username: string;
  api_key?: string;
  pat?: string;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

interface MendixCredentialsProps {
  credentials: MendixCredential[];
  onCredentialsChange: (credentials: MendixCredential[]) => void;
}

const MendixCredentials = ({ credentials, onCredentialsChange }: MendixCredentialsProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newCredential, setNewCredential] = useState({
    name: "",
    username: "",
    api_key: "",
    pat: ""
  });
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Migrate existing localStorage credentials to database
  useEffect(() => {
    const migrateLocalStorageCredentials = async () => {
      const savedCredentials = localStorage.getItem('mendix-credentials');
      if (savedCredentials && credentials.length === 0) {
        try {
          const localCredentials = JSON.parse(savedCredentials);
          if (localCredentials.length > 0) {
            // Migrate each credential to database
            for (const cred of localCredentials) {
              await supabase
                .from('mendix_credentials')
                .insert({
                  user_id: (await supabase.auth.getUser()).data.user?.id,
                  name: cred.name,
                  username: cred.username,
                  api_key: cred.apiKey,
                  pat: cred.pat
                });
            }
            // Clear localStorage after successful migration
            localStorage.removeItem('mendix-credentials');
            // Refresh credentials
            fetchCredentials();
            toast({
              title: "Credentials migrated",
              description: "Your existing credentials have been moved to secure storage"
            });
          }
        } catch (error) {
          console.error('Migration failed:', error);
        }
      }
    };

    migrateLocalStorageCredentials();
  }, [credentials.length]);

  const fetchCredentials = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('mendix_credentials')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      onCredentialsChange(data || []);
    } catch (error) {
      console.error('Error fetching credentials:', error);
      toast({
        title: "Error loading credentials",
        description: "Failed to load your credentials from the database",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Fetch credentials on component mount
  useEffect(() => {
    fetchCredentials();
  }, []);

  const handleAddCredential = async () => {
    if (!newCredential.name || !newCredential.username || !newCredential.api_key || !newCredential.pat) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('mendix_credentials')
        .insert({
          user_id: user.user.id,
          name: newCredential.name,
          username: newCredential.username,
          api_key: newCredential.api_key,
          pat: newCredential.pat
        })
        .select()
        .single();

      if (error) throw error;

      onCredentialsChange([data, ...credentials]);
      setNewCredential({ name: "", username: "", api_key: "", pat: "" });
      setIsAdding(false);
      
      toast({
        title: "Credential added",
        description: `${newCredential.name} has been added successfully`
      });
    } catch (error) {
      console.error('Error adding credential:', error);
      toast({
        title: "Error adding credential",
        description: "Failed to save credential to database",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCredential = async (id: string) => {
    const credential = credentials.find(c => c.id === id);
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('mendix_credentials')
        .delete()
        .eq('id', id);

      if (error) throw error;

      onCredentialsChange(credentials.filter(c => c.id !== id));
      
      toast({
        title: "Credential removed",
        description: `${credential?.name} has been removed`
      });
    } catch (error) {
      console.error('Error deleting credential:', error);
      toast({
        title: "Error deleting credential",
        description: "Failed to remove credential from database",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditCredential = async (id: string, updatedCredential: Partial<MendixCredential>) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('mendix_credentials')
        .update({
          name: updatedCredential.name,
          username: updatedCredential.username,
          api_key: updatedCredential.api_key,
          pat: updatedCredential.pat
        })
        .eq('id', id);

      if (error) throw error;

      onCredentialsChange(credentials.map(c => 
        c.id === id ? { ...c, ...updatedCredential } : c
      ));
      setEditingId(null);
      
      toast({
        title: "Credential updated",
        description: "Changes have been saved successfully"
      });
    } catch (error) {
      console.error('Error updating credential:', error);
      toast({
        title: "Error updating credential",
        description: "Failed to save changes to database",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading && credentials.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Mendix Credentials</h3>
        </div>
        <Card className="bg-gradient-card border-border">
          <CardContent className="text-center py-12">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading credentials...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Mendix Credentials</h3>
        <Button
          onClick={() => setIsAdding(true)}
          className="bg-gradient-primary hover:opacity-90"
          disabled={isAdding || loading}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Credential
        </Button>
      </div>

      {isAdding && (
        <Card className="bg-gradient-card border-border">
          <CardHeader>
            <CardTitle className="text-lg">Add New Mendix Credential</CardTitle>
            <CardDescription>
              Enter your Mendix credentials to access your applications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-name" className="text-sm font-medium">
                Credential Name
              </Label>
              <Input
                id="new-name"
                placeholder="e.g., Production Account"
                value={newCredential.name}
                onChange={(e) => setNewCredential({ ...newCredential, name: e.target.value })}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-username" className="text-sm font-medium">
                Mendix Username
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  id="new-username"
                  placeholder="Enter your Mendix username"
                  value={newCredential.username}
                  onChange={(e) => setNewCredential({ ...newCredential, username: e.target.value })}
                  className="pl-10"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-apikey" className="text-sm font-medium">
                API Key
              </Label>
              <div className="relative">
                <Key className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  id="new-apikey"
                  type="password"
                  placeholder="Enter your API key"
                  value={newCredential.api_key}
                  onChange={(e) => setNewCredential({ ...newCredential, api_key: e.target.value })}
                  className="pl-10"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-pat" className="text-sm font-medium">
                Personal Access Token (PAT)
              </Label>
              <div className="relative">
                <Shield className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  id="new-pat"
                  type="password"
                  placeholder="Enter your PAT"
                  value={newCredential.pat}
                  onChange={(e) => setNewCredential({ ...newCredential, pat: e.target.value })}
                  className="pl-10"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={handleAddCredential} 
                className="bg-gradient-primary hover:opacity-90"
                disabled={loading}
              >
                <Save className="w-4 h-4 mr-2" />
                Save Credential
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setIsAdding(false);
                  setNewCredential({ name: "", username: "", api_key: "", pat: "" });
                }}
                disabled={loading}
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {credentials.length === 0 && !isAdding && !loading && (
        <Card className="bg-gradient-card border-border">
          <CardContent className="text-center py-12">
            <Shield className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No Mendix credentials configured</p>
            <p className="text-sm text-muted-foreground">Add your first credential to get started</p>
          </CardContent>
        </Card>
      )}

      {credentials.map((credential) => (
        <Card key={credential.id} className="bg-gradient-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-4 h-4 text-primary" />
                  <h4 className="font-semibold">{credential.name}</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  Username: {credential.username}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingId(credential.id)}
                  disabled={loading}
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteCredential(credential.id)}
                  className="text-destructive hover:text-destructive"
                  disabled={loading}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default MendixCredentials;