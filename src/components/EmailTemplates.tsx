import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Mail, Send, Eye, Save } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface EmailTemplate {
  id: string;
  template_type: string;
  template_name: string;
  subject_template: string;
  html_template: string;
  is_default: boolean;
}

const DEFAULT_TEMPLATES = {
  log_alert: {
    template_name: "Log Alert",
    subject_template: "Alert: {{error_count}} errors in {{app_name}} - {{environment_name}}",
    html_template: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Log Alert</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 28px;">🚨 Log Alert</h1>
    <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Environment monitoring detected issues</p>
  </div>
  
  <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
    <h2 style="color: #dc3545; margin-top: 0;">Alert Details</h2>
    <p><strong>Application:</strong> {{app_name}}</p>
    <p><strong>Environment:</strong> {{environment_name}}</p>
    <p><strong>Error Count:</strong> {{error_count}}</p>
    <p><strong>Critical Count:</strong> {{critical_count}}</p>
    <p><strong>Time:</strong> {{timestamp}}</p>
    
    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc3545;">
      <h3 style="margin-top: 0; color: #dc3545;">Recent Log Entries</h3>
      <pre style="white-space: pre-wrap; font-size: 12px; color: #666;">{{log_content}}</pre>
    </div>
    
    <p style="margin-bottom: 0; color: #6c757d; font-size: 14px;">
      This alert was generated automatically by your Mendix Monitoring Dashboard.
    </p>
  </div>
</body>
</html>`
  },
  cloud_action_success: {
    template_name: "Cloud Action Success",
    subject_template: "✅ {{action_type}} completed successfully - {{app_name}} ({{environment_name}})",
    html_template: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Action Success</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 28px;">✅ Action Completed</h1>
    <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Your cloud action has finished successfully</p>
  </div>
  
  <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
    <h2 style="color: #28a745; margin-top: 0;">Success Details</h2>
    <p><strong>Application:</strong> {{app_name}}</p>
    <p><strong>Action:</strong> {{action_type}}</p>
    <p><strong>Environment:</strong> {{environment_name}}</p>
    <p><strong>Started:</strong> {{started_at}}</p>
    <p><strong>Completed:</strong> {{completed_at}}</p>
    <p><strong>Duration:</strong> {{duration}}</p>
    
    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
      <h3 style="margin-top: 0; color: #28a745;">Action Summary</h3>
      <p>{{summary}}</p>
    </div>
    
    <p style="margin-bottom: 0; color: #6c757d; font-size: 14px;">
      This notification was sent by your Mendix Monitoring Dashboard.
    </p>
  </div>
</body>
</html>`
  },
  cloud_action_failure: {
    template_name: "Cloud Action Failure",
    subject_template: "❌ {{action_type}} failed - {{app_name}} ({{environment_name}})",
    html_template: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Action Failed</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 28px;">❌ Action Failed</h1>
    <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Your cloud action encountered an error</p>
  </div>
  
  <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
    <h2 style="color: #dc3545; margin-top: 0;">Failure Details</h2>
    <p><strong>Application:</strong> {{app_name}}</p>
    <p><strong>Action:</strong> {{action_type}}</p>
    <p><strong>Environment:</strong> {{environment_name}}</p>
    <p><strong>Started:</strong> {{started_at}}</p>
    <p><strong>Failed at:</strong> {{failed_at}}</p>
    <p><strong>Attempt:</strong> {{attempt_count}}</p>
    
    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc3545;">
      <h3 style="margin-top: 0; color: #dc3545;">Error Message</h3>
      <pre style="white-space: pre-wrap; font-size: 12px; color: #666;">{{error_message}}</pre>
    </div>
    
    <p style="margin-bottom: 0; color: #6c757d; font-size: 14px;">
      This notification was sent by your Mendix Monitoring Dashboard.
    </p>
  </div>
</body>
</html>`
  }
};

export const EmailTemplates = () => {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('template_type', { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) {
        // Create default templates
        await createDefaultTemplates();
        return;
      }

      setTemplates(data);
      if (data.length > 0) {
        setSelectedTemplate(data[0]);
      }
    } catch (error: any) {
      toast({
        title: "Error loading templates",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const createDefaultTemplates = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const defaultTemplates = Object.entries(DEFAULT_TEMPLATES).map(([type, template]) => ({
        user_id: user.id,
        template_type: type,
        template_name: template.template_name,
        subject_template: template.subject_template,
        html_template: template.html_template,
        is_default: true,
      }));

      const { data, error } = await supabase
        .from('email_templates')
        .upsert(defaultTemplates, { 
          onConflict: 'user_id,template_type',
          ignoreDuplicates: true 
        })
        .select();

      if (error) throw error;

      setTemplates(data);
      if (data.length > 0) {
        setSelectedTemplate(data[0]);
      }

      toast({
        title: "Default templates created",
        description: "Email templates have been set up with default content.",
      });
    } catch (error: any) {
      toast({
        title: "Error creating templates",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const saveTemplate = async () => {
    if (!selectedTemplate) return;

    try {
      const { error } = await supabase
        .from('email_templates')
        .update({
          template_name: selectedTemplate.template_name,
          subject_template: selectedTemplate.subject_template,
          html_template: selectedTemplate.html_template,
        })
        .eq('id', selectedTemplate.id);

      if (error) throw error;

      setIsEditing(false);
      toast({
        title: "Template saved",
        description: "Email template has been updated successfully.",
      });

      loadTemplates();
    } catch (error: any) {
      toast({
        title: "Error saving template",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const sendTestEmail = async () => {
    if (!selectedTemplate || !testEmail) {
      toast({
        title: "Missing information",
        description: "Please select a template and enter a test email address.",
        variant: "destructive",
      });
      return;
    }

    try {
      const testVariables = {
        app_name: "Sample Mendix App",
        environment_name: "Test Environment",
        error_count: "5",
        critical_count: "2",
        timestamp: new Date().toLocaleString(),
        log_content: "ERROR: Database connection failed\nCRITICAL: Memory usage exceeded 90%",
        action_type: "Deploy",
        started_at: new Date(Date.now() - 300000).toLocaleString(),
        completed_at: new Date().toLocaleString(),
        failed_at: new Date().toLocaleString(),
        duration: "5 minutes",
        attempt_count: "1",
        error_message: "Package validation failed: Missing dependency",
        summary: "Successfully deployed application to test environment"
      };

      const response = await supabase.functions.invoke('send-email-mandrill', {
        body: {
          to: [{ email: testEmail }],
          subject: selectedTemplate.subject_template,
          html: selectedTemplate.html_template,
          template_variables: testVariables,
        },
      });

      if (response.error) throw response.error;

      toast({
        title: "Test email sent",
        description: `Test email sent successfully to ${testEmail}`,
      });
    } catch (error: any) {
      toast({
        title: "Error sending test email",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getPreviewHtml = () => {
    if (!selectedTemplate) return "";
    
    return selectedTemplate.html_template
      .replace(/{{app_name}}/g, "Sample Mendix App")
      .replace(/{{environment_name}}/g, "Test Environment")
      .replace(/{{error_count}}/g, "5")
      .replace(/{{critical_count}}/g, "2")
      .replace(/{{timestamp}}/g, new Date().toLocaleString())
      .replace(/{{log_content}}/g, "ERROR: Database connection failed\nCRITICAL: Memory usage exceeded 90%")
      .replace(/{{action_type}}/g, "Deploy")
      .replace(/{{started_at}}/g, new Date(Date.now() - 300000).toLocaleString())
      .replace(/{{completed_at}}/g, new Date().toLocaleString())
      .replace(/{{failed_at}}/g, new Date().toLocaleString())
      .replace(/{{duration}}/g, "5 minutes")
      .replace(/{{attempt_count}}/g, "1")
      .replace(/{{error_message}}/g, "Package validation failed: Missing dependency")
      .replace(/{{summary}}/g, "Successfully deployed application to test environment");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Mail className="h-5 w-5" />
        <h2 className="text-2xl font-bold">Email Templates</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Template List */}
        <Card>
          <CardHeader>
            <CardTitle>Templates</CardTitle>
            <CardDescription>
              Manage your email templates for notifications
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {templates.map((template) => (
                <Button
                  key={template.id}
                  variant={selectedTemplate?.id === template.id ? "default" : "outline"}
                  className="w-full justify-start"
                  onClick={() => setSelectedTemplate(template)}
                >
                  {template.template_name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Template Editor */}
        {selectedTemplate && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{selectedTemplate.template_name}</CardTitle>
                  <CardDescription>
                    Template type: {selectedTemplate.template_type.replace('_', ' ')}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Eye className="h-4 w-4" />
                        Preview
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
                      <DialogHeader>
                        <DialogTitle>Email Preview</DialogTitle>
                        <DialogDescription>
                          Preview of the email template with sample data
                        </DialogDescription>
                      </DialogHeader>
                      <div 
                        className="border rounded-lg p-4 bg-white"
                        dangerouslySetInnerHTML={{ __html: getPreviewHtml() }}
                      />
                    </DialogContent>
                  </Dialog>
                  
                  {isEditing ? (
                    <Button onClick={saveTemplate} size="sm">
                      <Save className="h-4 w-4" />
                      Save
                    </Button>
                  ) : (
                    <Button onClick={() => setIsEditing(true)} size="sm">
                      Edit
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="content">
                <TabsList>
                  <TabsTrigger value="content">Content</TabsTrigger>
                  <TabsTrigger value="test">Test</TabsTrigger>
                </TabsList>
                
                <TabsContent value="content" className="space-y-4">
                  <div>
                    <Label>Template Name</Label>
                    <Input
                      value={selectedTemplate.template_name}
                      onChange={(e) => setSelectedTemplate({
                        ...selectedTemplate,
                        template_name: e.target.value
                      })}
                      disabled={!isEditing}
                    />
                  </div>
                  
                  <div>
                    <Label>Subject Template</Label>
                    <Input
                      value={selectedTemplate.subject_template}
                      onChange={(e) => setSelectedTemplate({
                        ...selectedTemplate,
                        subject_template: e.target.value
                      })}
                      disabled={!isEditing}
                      placeholder="Use {{variable_name}} for dynamic content"
                    />
                  </div>
                  
                  <div>
                    <Label>HTML Template</Label>
                    <Textarea
                      value={selectedTemplate.html_template}
                      onChange={(e) => setSelectedTemplate({
                        ...selectedTemplate,
                        html_template: e.target.value
                      })}
                      disabled={!isEditing}
                      className="min-h-[300px] font-mono text-sm"
                      placeholder="HTML email template with {{variable_name}} placeholders"
                    />
                  </div>
                  
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium">Available variables:</p>
                    <p>{"{{app_name}}, {{environment_name}}, {{error_count}}, {{critical_count}}, {{timestamp}}, {{log_content}}, {{action_type}}, {{started_at}}, {{completed_at}}, {{failed_at}}, {{duration}}, {{attempt_count}}, {{error_message}}, {{summary}}"}</p>
                  </div>
                </TabsContent>
                
                <TabsContent value="test" className="space-y-4">
                  <div>
                    <Label>Test Email Address</Label>
                    <Input
                      type="email"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="Enter email to receive test"
                    />
                  </div>
                  
                  <Button onClick={sendTestEmail} className="w-full">
                    <Send className="h-4 w-4 mr-2" />
                    Send Test Email
                  </Button>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};