import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Trash2, Mail, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface NotificationEmail {
  id: string;
  email_address: string;
  display_name: string | null;
  is_active: boolean;
  log_monitoring_enabled: boolean;
  cloud_action_notifications_enabled: boolean;
}

const EmailManagement = () => {
  const [emails, setEmails] = useState<NotificationEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [addingEmail, setAddingEmail] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadEmails();
  }, []);

  const loadEmails = async () => {
    try {
      const { data, error } = await supabase
        .from('notification_email_addresses')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEmails(data || []);
    } catch (error) {
      console.error('Error loading emails:', error);
      toast({
        title: "Error",
        description: "Failed to load email addresses",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const addEmail = async () => {
    if (!newEmail.trim()) {
      toast({
        title: "Error",
        description: "Please enter an email address",
        variant: "destructive",
      });
      return;
    }

    if (!validateEmail(newEmail)) {
      toast({
        title: "Error",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    // Check for duplicates
    if (emails.some(email => email.email_address.toLowerCase() === newEmail.toLowerCase())) {
      toast({
        title: "Error",
        description: "This email address is already added",
        variant: "destructive",
      });
      return;
    }

    setAddingEmail(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('notification_email_addresses')
        .insert({
          user_id: user.id,
          email_address: newEmail.trim(),
          display_name: newDisplayName.trim() || null,
          is_active: true,
          log_monitoring_enabled: false,
          cloud_action_notifications_enabled: false,
        })
        .select()
        .single();

      if (error) throw error;

      setEmails([data, ...emails]);
      setNewEmail("");
      setNewDisplayName("");
      toast({
        title: "Success",
        description: "Email address added successfully",
      });
    } catch (error) {
      console.error('Error adding email:', error);
      toast({
        title: "Error",
        description: "Failed to add email address",
        variant: "destructive",
      });
    } finally {
      setAddingEmail(false);
    }
  };

  const updateEmail = async (id: string, updates: Partial<NotificationEmail>) => {
    setSaving(id);
    try {
      const { error } = await supabase
        .from('notification_email_addresses')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      setEmails(emails.map(email => 
        email.id === id ? { ...email, ...updates } : email
      ));

      toast({
        title: "Success",
        description: "Email settings updated",
      });
    } catch (error) {
      console.error('Error updating email:', error);
      toast({
        title: "Error",
        description: "Failed to update email settings",
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  };

  const deleteEmail = async (id: string) => {
    try {
      const { error } = await supabase
        .from('notification_email_addresses')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setEmails(emails.filter(email => email.id !== id));
      toast({
        title: "Success",
        description: "Email address deleted",
      });
    } catch (error) {
      console.error('Error deleting email:', error);
      toast({
        title: "Error",
        description: "Failed to delete email address",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Email Management</h2>
        <p className="text-muted-foreground">
          Manage email addresses for receiving notifications about log monitoring and cloud actions.
        </p>
      </div>

      {/* Add New Email */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Add Email Address
          </CardTitle>
          <CardDescription>
            Add a new email address to receive notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name (Optional)</Label>
              <Input
                id="displayName"
                placeholder="Production Team"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
              />
            </div>
          </div>
          <Button onClick={addEmail} disabled={addingEmail}>
            {addingEmail ? "Adding..." : "Add Email"}
          </Button>
        </CardContent>
      </Card>

      {/* Email List */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Notification Email Addresses ({emails.length})</h3>
        
        {emails.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Mail className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No email addresses configured yet.</p>
              <p className="text-sm text-muted-foreground mt-2">
                Add an email address above to start receiving notifications.
              </p>
            </CardContent>
          </Card>
        ) : (
          emails.map((email) => (
            <Card key={email.id}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{email.email_address}</span>
                      {email.display_name && (
                        <span className="text-sm text-muted-foreground">
                          ({email.display_name})
                        </span>
                      )}
                    </div>
                    
                    <div className="space-y-3 mt-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label htmlFor={`active-${email.id}`} className="text-sm font-medium">
                            Active
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Enable/disable this email address
                          </p>
                        </div>
                        <Switch
                          id={`active-${email.id}`}
                          checked={email.is_active}
                          onCheckedChange={(checked) => 
                            updateEmail(email.id, { is_active: checked })
                          }
                          disabled={saving === email.id}
                        />
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div>
                          <Label htmlFor={`log-${email.id}`} className="text-sm font-medium">
                            Log Monitoring Notifications
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Receive alerts for log monitoring events
                          </p>
                        </div>
                        <Switch
                          id={`log-${email.id}`}
                          checked={email.log_monitoring_enabled}
                          onCheckedChange={(checked) => 
                            updateEmail(email.id, { log_monitoring_enabled: checked })
                          }
                          disabled={saving === email.id || !email.is_active}
                        />
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div>
                          <Label htmlFor={`cloud-${email.id}`} className="text-sm font-medium">
                            Cloud Action Notifications
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Receive alerts for cloud action success/failure
                          </p>
                        </div>
                        <Switch
                          id={`cloud-${email.id}`}
                          checked={email.cloud_action_notifications_enabled}
                          onCheckedChange={(checked) => 
                            updateEmail(email.id, { cloud_action_notifications_enabled: checked })
                          }
                          disabled={saving === email.id || !email.is_active}
                        />
                      </div>
                    </div>
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteEmail(email.id)}
                    className="text-destructive hover:text-destructive"
                    disabled={saving === email.id}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default EmailManagement;