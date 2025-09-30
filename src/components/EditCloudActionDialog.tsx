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
  project_id: string | null;
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
  const [branches, setBranches] = useState<string[]>([]);
  const [revisions, setRevisions] = useState<{ id: string; message: string }[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingRevisions, setLoadingRevisions] = useState(false);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingBranch, setEditingBranch] = useState(false);
  const [editingRevision, setEditingRevision] = useState(false);
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
    branchName: z.string().optional(),
    revisionId: z.string().optional(),
    versionMajor: z.number().min(0).optional(),
    versionMinor: z.number().min(0).optional(),
    versionPatch: z.number().min(0).optional(),
    description: z.string().optional(),
    comment: z.string().optional(),
  });

  // Parse existing version string into major, minor, patch
  const parseVersion = (versionString: string) => {
    if (!versionString) return { major: undefined, minor: undefined, patch: undefined };
    const parts = versionString.split('.').map(p => parseInt(p, 10));
    return {
      major: parts[0] || undefined,
      minor: parts[1] || undefined,
      patch: parts[2] || undefined,
    };
  };

  const parsedVersion = parseVersion(action.payload?.version || "");

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
      branchName: action.payload?.branchName ?? action.payload?.branch ?? "",
      revisionId: action.payload?.revisionId ?? action.payload?.revision ?? "",
      versionMajor: parsedVersion.major ?? 1,
      versionMinor: parsedVersion.minor ?? 0,
      versionPatch: parsedVersion.patch ?? 0,
      description: action.payload?.description || "Pintosoft deployment",
      comment: action.payload?.comment || "",
    },
  });

  useEffect(() => {
    if (open) {
      loadCredentials();
      loadApps();
      loadEnvironments();
      
      // Pre-populate branches and revisions with current values from payload
      const currentBranch = action.payload?.branchName ?? action.payload?.branch;
      const currentRevisionId = action.payload?.revisionId ?? action.payload?.revision;
      const currentRevisionMessage = action.payload?.revisionMessage ?? "";
      
      if (currentBranch) {
        setBranches([currentBranch]);
      }
      if (currentRevisionId) {
        setRevisions([{ id: currentRevisionId, message: currentRevisionMessage }]);
      }
      
      // If this is a transport action, load packages immediately with action values
      if (action.action_type === "transport" && action.credential_id && action.app_id) {
        loadPackages(action.credential_id, action.app_id);
      }
    } else {
      // Reset editing states when dialog closes
      setEditingBranch(false);
      setEditingRevision(false);
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
  const selectedBranchName = form.watch("branchName");

  useEffect(() => {
    if (open && editingBranch && selectedCredentialId && selectedAppId && (selectedActionType === "deploy")) {
      loadBranches(selectedCredentialId, selectedAppId);
    }
  }, [open, editingBranch, selectedCredentialId, selectedAppId, selectedActionType]);

  useEffect(() => {
    if (open && editingRevision && selectedCredentialId && selectedAppId && selectedBranchName && (selectedActionType === "deploy")) {
      loadRevisions(selectedCredentialId, selectedAppId, selectedBranchName);
    }
  }, [open, editingRevision, selectedCredentialId, selectedAppId, selectedBranchName, selectedActionType]);

  useEffect(() => {
    if (open && selectedCredentialId && selectedAppId && (selectedActionType === "transport")) {
      loadPackages(selectedCredentialId, selectedAppId);
    }
  }, [open, selectedCredentialId, selectedAppId, selectedActionType]);

  const loadBranches = async (credentialId?: string, appId?: string) => {
    const credId = credentialId || selectedCredentialId;
    const appIdToUse = appId || selectedAppId;
    
    if (!credId || !appIdToUse) return;
    
    setLoadingBranches(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-mendix-branches", {
        body: { 
          credentialId: credId,
          appId: appIdToUse
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

  const loadRevisions = async (credentialId?: string, appId?: string, branchName?: string) => {
    const credId = credentialId || selectedCredentialId;
    const appIdToUse = appId || selectedAppId;
    const branch = branchName || selectedBranchName;
    
    if (!credId || !appIdToUse || !branch) return;
    
    setLoadingRevisions(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-mendix-commits", {
        body: { 
          credentialId: credId,
          appId: appIdToUse,
          branchName: branch
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

  const loadPackages = async (credentialId?: string, appId?: string) => {
    const credId = credentialId || selectedCredentialId;
    const appIdToUse = appId || selectedAppId;
    
    if (!credId || !appIdToUse) return;
    
    setLoadingPackages(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-mendix-packages", {
        body: { 
          credentialId: credId,
          appId: appIdToUse,
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
      if (values.branchName && values.action_type === "deploy") {
        payload.branchName = values.branchName;
      }
      if (values.revisionId && values.action_type === "deploy") {
        payload.revisionId = values.revisionId;
        // Find and save the revision message for future display
        const selectedRevision = revisions.find(r => r.id === values.revisionId);
        if (selectedRevision) {
          payload.revisionMessage = selectedRevision.message;
        }
      }
      if (values.action_type === "deploy" && (values.versionMajor !== undefined || values.versionMinor !== undefined || values.versionPatch !== undefined)) {
        const major = values.versionMajor || 0;
        const minor = values.versionMinor || 0;
        const patch = values.versionPatch || 0;
        payload.version = `${major}.${minor}.${patch}`;
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
      setEditingBranch(false);
      setEditingRevision(false);
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
                        <SelectItem key={app.id} value={app.project_id || app.app_id || ''}>
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
                  name="branchName"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Branch {loadingBranches && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}</FormLabel>
                        {!editingBranch && field.value && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingBranch(true)}
                            className="h-7 text-xs"
                          >
                            Change
                          </Button>
                        )}
                      </div>
                      <Select 
                        onValueChange={(value) => {
                          field.onChange(value);
                          setEditingRevision(false);
                          setRevisions([]);
                        }} 
                        value={field.value} 
                        disabled={loadingBranches || (!editingBranch && !!field.value)}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select branch" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {branches.map((branch) => (
                            <SelectItem key={branch} value={branch}>
                              {branch}
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
                  name="revisionId"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Revision {loadingRevisions && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}</FormLabel>
                        {!editingRevision && field.value && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingRevision(true)}
                            className="h-7 text-xs"
                          >
                            Change
                          </Button>
                        )}
                      </div>
                      <Select 
                        onValueChange={field.onChange} 
                        value={field.value} 
                        disabled={loadingRevisions || !selectedBranchName || (!editingRevision && !!field.value)}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select revision" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {revisions.map((revision) => (
                            <SelectItem key={revision.id} value={revision.id}>
                              {revision.id.substring(0, 8)} - {revision.message}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-3 gap-2">
                  <FormField
                    control={form.control}
                    name="versionMajor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Major</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            placeholder="1"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="versionMinor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Minor</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            placeholder="0"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="versionPatch"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Patch</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            placeholder="0"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

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