import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Key, User, Shield, Edit2, Save, X } from "lucide-react";

export interface MendixCredential {
  id: string;
  name: string;
  username: string;
  apiKey: string;
  pat: string;
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
    apiKey: "",
    pat: ""
  });
  const [isAdding, setIsAdding] = useState(false);
  const { toast } = useToast();

  const handleAddCredential = () => {
    if (!newCredential.name || !newCredential.username || !newCredential.apiKey || !newCredential.pat) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    const credential: MendixCredential = {
      id: Date.now().toString(),
      ...newCredential
    };

    onCredentialsChange([...credentials, credential]);
    setNewCredential({ name: "", username: "", apiKey: "", pat: "" });
    setIsAdding(false);
    
    toast({
      title: "Credential added",
      description: `${newCredential.name} has been added successfully`
    });
  };

  const handleDeleteCredential = (id: string) => {
    const credential = credentials.find(c => c.id === id);
    onCredentialsChange(credentials.filter(c => c.id !== id));
    
    toast({
      title: "Credential removed",
      description: `${credential?.name} has been removed`
    });
  };

  const handleEditCredential = (id: string, updatedCredential: Partial<MendixCredential>) => {
    onCredentialsChange(credentials.map(c => 
      c.id === id ? { ...c, ...updatedCredential } : c
    ));
    setEditingId(null);
    
    toast({
      title: "Credential updated",
      description: "Changes have been saved successfully"
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Mendix Credentials</h3>
        <Button
          onClick={() => setIsAdding(true)}
          className="bg-gradient-primary hover:opacity-90"
          disabled={isAdding}
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
                  value={newCredential.apiKey}
                  onChange={(e) => setNewCredential({ ...newCredential, apiKey: e.target.value })}
                  className="pl-10"
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
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleAddCredential} className="bg-gradient-primary hover:opacity-90">
                <Save className="w-4 h-4 mr-2" />
                Save Credential
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setIsAdding(false);
                  setNewCredential({ name: "", username: "", apiKey: "", pat: "" });
                }}
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {credentials.length === 0 && !isAdding && (
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
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteCredential(credential.id)}
                  className="text-destructive hover:text-destructive"
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