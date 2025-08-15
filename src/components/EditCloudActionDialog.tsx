import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Edit, Loader2 } from "lucide-react";

interface CloudActionRow {
  id: string;
  user_id: string;
  credential_id: string;
  app_id: string;
  environment_name: string;
  action_type: string;
  status: string;
  scheduled_for: string | null;
  retry_until?: string | null;
  payload?: any;
  created_at: string;
  updated_at?: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

interface Credential {
  id: string;
  name: string;
  username: string;
  api_key: string | null;
  pat: string | null;
}

interface App {
  id: string;
  credential_id: string;
  app_id: string | null;
  app_name: string;
}

interface Env {
  id: string;
  app_id: string;
  environment_name: string;
}

interface EditCloudActionDialogProps {
  action: CloudActionRow;
  onUpdated: () => void;
}

export const EditCloudActionDialog: React.FC<EditCloudActionDialogProps> = ({ action, onUpdated }) => {
  const [open, setOpen] = useState(false);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [environments, setEnvironments] = useState<Env[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [revisions, setRevisions] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingRevisions, setLoadingRevisions] = useState(false);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const formSchema = z.object({
    credential_id: z.string().min(1, "Please select credentials"),
    app_id: z.string().min(1, "Please select an app"),
    environment_name: z.string().min(1, "Please select an environment"),
    action_type: z.enum(["start", "stop", "restart", "transport", "deploy"]),
    scheduled_for: z.string().optional(),
    retry_until: z.string().optional(),
    source_environment: z.string().optional(),
    package_id: z.string().optional(),
    branch: z.string().optional(),
    revision: z.string().optional(),
    version: z.string().optional(),
    description: z.string().optional(),
    comment: z.string().optional(),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      credential_id: action.credential_id,
      app_id: action.app_id,
      environment_name: action.environment_name,
      action_type: action.action_type as any,
      scheduled_for: action.scheduled_for ? new Date(action.scheduled_for).toISOString().slice(0, 16) : "",
      retry_until: action.retry_until ? new Date(action.retry_until).toISOString().slice(0, 16) : "",
      source_environment: action.payload?.source_environment || "",
      package_id: action.payload?.package_id || "",
      branch: action.payload?.branch || "",
      revision: action.payload?.revision || "",
      version: action.payload?.version || "",
      description: action.payload?.description || "",
      comment: action.payload?.comment || "",
    },
  });

  useEffect(() => {
    if (open) {
      loadCredentials();
      loadApps();
      loadEnvironments();
    }
  }, [open]);

  const loadCredentials = async () => {
    const { data, error } = await supabase.from("mendix_credentials").select("*");
    if (error) {
      console.error("Error loading credentials:", error);
      return;
    }
    setCredentials(data || []);
  };

  const loadApps = async () => {
    const { data, error } = await supabase.from("mendix_apps").select("*");
    if (error) {
      console.error("Error loading apps:", error);
      return;
    }
    setApps(data || []);
  };

  const loadEnvironments = async () => {
    const { data, error } = await supabase.from("mendix_environments").select("*");
    if (error) {
      console.error("Error loading environments:", error);
      return;
    }
    setEnvironments(data || []);
  };

  const selectedCredentialId = form.watch("credential_id");
  const selectedAppId = form.watch("app_id");
  const selectedActionType = form.watch("action_type");
  const selectedBranch = form.watch("branch");

  useEffect(() => {
    if (open && selectedCredentialId && selectedAppId && (selectedActionType === "deploy")) {
      loadBranches();
    } else if (!open) {
      setBranches([]);
    }
  }, [open, selectedCredentialId, selectedAppId, selectedActionType]);

  useEffect(() => {
    if (open && selectedCredentialId && selectedAppId && selectedBranch && (selectedActionType === "deploy")) {
      loadRevisions();
    } else if (!open) {
      setRevisions([]);
    }
  }, [open, selectedCredentialId, selectedAppId, selectedBranch, selectedActionType]);

  useEffect(() => {
    if (open && selectedCredentialId && selectedAppId && (selectedActionType === "transport")) {
      loadPackages();
    } else if (!open) {
      setPackages([]);
    }
  }, [open, selectedCredentialId, selectedAppId, selectedActionType]);

  const loadBranches = async () => {
    setLoadingBranches(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-mendix-branches", {
        body: { 
          credentialId: selectedCredentialId,
          appId: selectedAppId
        }
      });
      
      if (error) throw error;
      setBranches(data?.branches || []);
    } catch (error) {
      console.error("Error loading branches:", error);
      toast({
        title: "Error",
        description: "Failed to load branches",
        variant: "destructive",
      });
    } finally {
      setLoadingBranches(false);
    }
  };

  const loadRevisions = async () => {
    setLoadingRevisions(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-mendix-commits", {
        body: { 
          credentialId: selectedCredentialId,
          appId: selectedAppId,
          branchName: selectedBranch
        }
      });
      
      if (error) throw error;
      setRevisions(data?.commits || []);
    } catch (error) {
      console.error("Error loading revisions:", error);
      toast({
        title: "Error",
        description: "Failed to load revisions",
        variant: "destructive",
      });
    } finally {
      setLoadingRevisions(false);
    }
  };

  const loadPackages = async () => {
    setLoadingPackages(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-mendix-packages", {
        body: { 
          credentialId: selectedCredentialId,
          appId: selectedAppId,
          branchName: "trunk" // Default branch for packages
        }
      });
      
      if (error) throw error;
      setPackages(data?.packages || []);
    } catch (error) {
      console.error("Error loading packages:", error);
      toast({
        title: "Error",
        description: "Failed to load packages",
        variant: "destructive",
      });
    } finally {
      setLoadingPackages(false);
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setSubmitting(true);
    try {
      const payload: any = {};
      
      if (values.source_environment && values.action_type === "transport") {
        payload.source_environment = values.source_environment;
      }
      if (values.package_id && values.action_type === "transport") {
        payload.package_id = values.package_id;
      }
      if (values.branch && values.action_type === "deploy") {
        payload.branch = values.branch;
      }
      if (values.revision && values.action_type === "deploy") {
        payload.revision = values.revision;
      }
      if (values.version && values.action_type === "deploy") {
        payload.version = values.version;
      }
      if (values.description && values.action_type === "deploy") {
        payload.description = values.description;
      }
      if (values.comment) {
        payload.comment = values.comment;
      }

      const updateData: any = {
        credential_id: values.credential_id,
        app_id: values.app_id,
        environment_name: values.environment_name,
        action_type: values.action_type,
        payload: Object.keys(payload).length > 0 ? payload : null,
        status: "scheduled", // Reset status to scheduled
      };

      if (values.scheduled_for) {
        updateData.scheduled_for = new Date(values.scheduled_for).toISOString();
      }
      if (values.retry_until) {
        updateData.retry_until = new Date(values.retry_until).toISOString();
      }

      const { error } = await supabase
        .from("cloud_actions")
        .update(updateData)
        .eq("id", action.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Cloud action updated successfully",
      });

      setOpen(false);
      form.reset();
      onUpdated();
    } catch (error) {
      console.error("Error updating cloud action:", error);
      toast({
        title: "Error",
        description: "Failed to update cloud action",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredApps = apps.filter(app => app.credential_id === selectedCredentialId);
  const filteredEnvironments = environments.filter(env => env.app_id === selectedAppId);
  const filteredSourceEnvironments = environments.filter(env => 
    env.app_id === selectedAppId && env.environment_name !== form.watch("environment_name")
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Edit className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Cloud Action</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="credential_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Credentials</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select credentials" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {credentials.map((cred) => (
                        <SelectItem key={cred.id} value={cred.id}>
                          {cred.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="app_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>App</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={!selectedCredentialId}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select app" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {filteredApps.map((app) => (
                        <SelectItem key={app.id} value={app.app_id || ''}>
                          {app.app_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="environment_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target Environment</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={!selectedAppId}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select environment" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {filteredEnvironments.map((env) => (
                        <SelectItem key={env.id} value={env.environment_name}>
                          {env.environment_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="action_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Action Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select action type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="start">Start</SelectItem>
                      <SelectItem value="stop">Stop</SelectItem>
                      <SelectItem value="restart">Restart</SelectItem>
                      <SelectItem value="transport">Transport</SelectItem>
                      <SelectItem value="deploy">Deploy</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedActionType === "transport" && (
              <>
                <FormField
                  control={form.control}
                  name="source_environment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Source Environment</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select source environment" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {filteredSourceEnvironments.map((env) => (
                            <SelectItem key={env.id} value={env.environment_name}>
                              {env.environment_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="package_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Package {loadingPackages && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={loadingPackages}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select package" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {packages.map((pkg) => (
                            <SelectItem key={pkg.PackageId} value={pkg.PackageId}>
                              {pkg.Name} ({pkg.Version})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="comment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Comment (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Optional comment for this transport..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {selectedActionType === "deploy" && (
              <>
                <FormField
                  control={form.control}
                  name="branch"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Branch {loadingBranches && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={loadingBranches}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select branch" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {branches.map((branch) => (
                            <SelectItem key={branch.Name} value={branch.Name}>
                              {branch.DisplayName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="revision"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Revision {loadingRevisions && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={loadingRevisions || !selectedBranch}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select revision" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {revisions.map((revision) => (
                            <SelectItem key={revision.CommitId} value={revision.CommitId}>
                              {revision.CommitId.substring(0, 8)} - {revision.Message}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="version"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Version</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., 1.0.0"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Description of the package..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="comment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Comment (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Optional comment for this deployment..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            <FormField
              control={form.control}
              name="scheduled_for"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Scheduled For (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="datetime-local"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="retry_until"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Retry Until (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="datetime-local"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Update Action
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};