import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Edit, Loader2, CalendarClock, CloudCog } from "lucide-react";
import { format, parse, startOfToday, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";

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
  const { toast } = useToast();

  const ActionType = z.enum(["start", "stop", "restart", "transport", "deploy"]);
  const formSchema = z
    .object({
      credential_id: z.string().min(1, "Please select credentials"),
      app_id: z.string().min(1, "Please select an app"),
      environment_name: z.string().min(1, "Please select an environment"),
      targetEnvironmentName: z.string().optional(),
      action_type: ActionType,
      runWhen: z.enum(["now", "schedule"]).default("now"),
      scheduledDate: z.date().optional(),
      scheduledTime: z.string().optional(), // HH:mm
      retryUntilDate: z.date().optional(),
      retryUntilTime: z.string().optional(), // HH:mm
      source_environment: z.string().optional(),
      package_id: z.string().optional(),
      branchName: z.string().optional(),
      revisionId: z.string().optional(),
      versionMajor: z.number().min(0).optional(),
      versionMinor: z.number().min(0).optional(),
      versionPatch: z.number().min(0).optional(),
      description: z.string().optional(),
      comment: z.string().optional(),
    })
    .superRefine((val, ctx) => {
      if (val.runWhen === "schedule") {
        if (!val.scheduledDate) ctx.addIssue({ code: "custom", message: "Date required", path: ["scheduledDate"] });
        if (!val.scheduledTime) ctx.addIssue({ code: "custom", message: "Time required", path: ["scheduledTime"] });

        if (val.scheduledDate && val.scheduledTime) {
          const scheduledAt = parse(val.scheduledTime, "HH:mm", val.scheduledDate);
          const now = new Date();
          if (scheduledAt <= now) {
            ctx.addIssue({ code: "custom", message: "Must be in the future", path: ["scheduledTime"] });
          }
        }
      }
      
      // Validate retry until datetime
      if (val.retryUntilDate && val.retryUntilTime) {
        const retryUntil = parse(val.retryUntilTime, "HH:mm", val.retryUntilDate);
        
        // Determine the base time for validation (either now or scheduled time)
        let baseTime = new Date();
        if (val.runWhen === "schedule" && val.scheduledDate && val.scheduledTime) {
          baseTime = parse(val.scheduledTime, "HH:mm", val.scheduledDate);
        }
        
        // Retry until must be at least 5 minutes from base time
        if (retryUntil <= new Date(baseTime.getTime() + 5 * 60 * 1000)) {
          const fromText = val.runWhen === "schedule" ? "scheduled time" : "now";
          ctx.addIssue({ code: "custom", message: `Must be at least 5 minutes from ${fromText}`, path: ["retryUntilTime"] });
        }
        
        // Retry until cannot exceed 24 hours from base time
        if (retryUntil > new Date(baseTime.getTime() + 24 * 60 * 60 * 1000)) {
          const fromText = val.runWhen === "schedule" ? "scheduled time" : "now";
          ctx.addIssue({ code: "custom", message: `Cannot exceed 24 hours from ${fromText}`, path: ["retryUntilTime"] });
        }
      }
      
      if (val.action_type === "transport" && !val.targetEnvironmentName) {
        ctx.addIssue({ code: "custom", message: "Target environment required", path: ["targetEnvironmentName"] });
      }
      if (val.action_type === "deploy") {
        if (!val.branchName) ctx.addIssue({ code: "custom", message: "Branch is required", path: ["branchName"] });
        if (!val.revisionId) ctx.addIssue({ code: "custom", message: "Revision is required", path: ["revisionId"] });
      }
    });

  type FormValues = z.infer<typeof formSchema>;

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

  // Convert UTC times from database to local date/time components
  const getLocalDateTime = (utcString: string | null) => {
    if (!utcString) return { date: undefined, time: "" };
    const date = new Date(utcString);
    return {
      date: date,
      time: format(date, "HH:mm"),
    };
  };

  const scheduledLocal = getLocalDateTime(action.scheduled_for);
  const retryUntilLocal = getLocalDateTime(action.retry_until || null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      credential_id: action.credential_id,
      app_id: action.app_id,
      environment_name: action.action_type === "transport" ? action.payload?.sourceEnvironmentName || action.environment_name : action.environment_name,
      targetEnvironmentName: action.action_type === "transport" ? action.environment_name : "",
      action_type: action.action_type as any,
      runWhen: action.scheduled_for ? "schedule" : "now",
      scheduledDate: scheduledLocal.date,
      scheduledTime: scheduledLocal.time,
      retryUntilDate: retryUntilLocal.date,
      retryUntilTime: retryUntilLocal.time,
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

  const credential_id = form.watch("credential_id");
  const app_id = form.watch("app_id");
  const action_type = form.watch("action_type");
  const runWhen = form.watch("runWhen");
  const scheduledDate = form.watch("scheduledDate");
  const scheduledTime = form.watch("scheduledTime");
  const retryUntilDate = form.watch("retryUntilDate");
  const branchName = form.watch("branchName");

  const minTime = useMemo(() => {
    if (!scheduledDate) return undefined;
    if (!isSameDay(scheduledDate as Date, new Date())) return undefined;
    return format(new Date(), "HH:mm");
  }, [scheduledDate]);

  const minRetryTime = useMemo(() => {
    if (!retryUntilDate) return undefined;
    if (!isSameDay(retryUntilDate as Date, new Date())) return undefined;
    return format(new Date(Date.now() + 5 * 60 * 1000), "HH:mm");
  }, [retryUntilDate]);

  // Auto-populate retry until when schedule changes
  useEffect(() => {
    if (runWhen === "now") {
      const now = new Date();
      const retryUntil = new Date(now.getTime() + 30 * 60 * 1000);
      form.setValue("retryUntilDate", retryUntil);
      form.setValue("retryUntilTime", format(retryUntil, "HH:mm"));
    } else if (runWhen === "schedule" && scheduledDate && scheduledTime) {
      const scheduledAt = parse(scheduledTime, "HH:mm", scheduledDate);
      const retryUntil = new Date(scheduledAt.getTime() + 30 * 60 * 1000);
      form.setValue("retryUntilDate", retryUntil);
      form.setValue("retryUntilTime", format(retryUntil, "HH:mm"));
    }
  }, [runWhen, scheduledDate, scheduledTime]);

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
      
      // If this is a transport action, load packages
      if (action.action_type === "transport" && action.credential_id && action.app_id) {
        loadPackages(action.credential_id, action.app_id);
      }
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

  useEffect(() => {
    if (open && credential_id && app_id && action_type === "deploy") {
      loadBranches(credential_id, app_id);
    }
  }, [open, credential_id, app_id, action_type]);

  useEffect(() => {
    if (open && credential_id && app_id && branchName && action_type === "deploy") {
      loadRevisions(credential_id, app_id, branchName);
    }
  }, [open, credential_id, app_id, branchName, action_type]);

  useEffect(() => {
    if (open && credential_id && app_id && action_type === "transport") {
      loadPackages(credential_id, app_id);
    }
  }, [open, credential_id, app_id, action_type]);

  const loadBranches = async (credentialId: string, appId: string) => {
    setLoadingBranches(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-mendix-branches", {
        body: { 
          credentialId: credentialId,
          appId: appId
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

  const loadRevisions = async (credentialId: string, appId: string, branch: string) => {
    setLoadingRevisions(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-mendix-commits", {
        body: { 
          credentialId: credentialId,
          appId: appId,
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

  const loadPackages = async (credentialId: string, appId: string) => {
    setLoadingPackages(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-mendix-packages", {
        body: { 
          credentialId: credentialId,
          appId: appId,
          branchName: "trunk"
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

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      // Calculate scheduled_for timestamp
      let scheduledFor = null;
      if (values.runWhen === "schedule" && values.scheduledDate && values.scheduledTime) {
        const scheduledDateTime = parse(values.scheduledTime, "HH:mm", values.scheduledDate);
        scheduledFor = scheduledDateTime.toISOString();
      }

      // Calculate retry_until timestamp
      let retryUntil = null;
      if (values.retryUntilDate && values.retryUntilTime) {
        const retryUntilDateTime = parse(values.retryUntilTime, "HH:mm", values.retryUntilDate);
        retryUntil = retryUntilDateTime.toISOString();
      }

      // Create action-specific payload
      const payload: any = {
        actionType: values.action_type,
        appId: values.app_id,
        environmentName: values.action_type === "transport" ? values.targetEnvironmentName : values.environment_name,
      };

      if (values.action_type === "transport") {
        payload.sourceEnvironmentName = values.environment_name;
        payload.comment = values.comment;
        if (values.package_id) {
          payload.package_id = values.package_id;
        }
      }

      if (values.action_type === "deploy") {
        payload.branchName = values.branchName;
        payload.revisionId = values.revisionId;
        if (values.versionMajor !== undefined || values.versionMinor !== undefined || values.versionPatch !== undefined) {
          const major = values.versionMajor || 0;
          const minor = values.versionMinor || 0;
          const patch = values.versionPatch || 0;
          payload.version = `${major}.${minor}.${patch}`;
        }
        payload.description = values.description;
        payload.comment = values.comment;
        const selectedRevision = revisions.find(r => r.id === values.revisionId);
        if (selectedRevision) {
          payload.revisionMessage = selectedRevision.message;
        }
      }

      const updateData: any = {
        credential_id: values.credential_id,
        app_id: values.app_id,
        environment_name: values.action_type === "transport" ? values.targetEnvironmentName : values.environment_name,
        action_type: values.action_type,
        payload: payload,
        status: "scheduled",
        scheduled_for: scheduledFor,
        retry_until: retryUntil,
      };

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

  const filteredApps = apps.filter(app => app.credential_id === credential_id);
  const filteredEnvironments = environments.filter(env => env.app_id === app_id);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Edit className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CloudCog className="h-5 w-5" /> Edit Cloud Action
          </DialogTitle>
          <DialogDescription>Update the cloud action configuration and scheduling.</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-8rem)] pr-4">
          <div className="grid gap-6 md:grid-cols-[1fr_280px]">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="credential_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Credential</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select credential" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {credentials.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
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
                      <FormLabel>Application</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={!credential_id}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={credential_id ? "Select app" : "Select credential first"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {filteredApps.map((a) => (
                            <SelectItem key={a.id} value={a.project_id || a.app_id || ''}>
                              {a.app_name}
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
                  name="runWhen"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <CalendarClock className="h-4 w-4" />
                        When to run
                      </FormLabel>
                      <FormControl>
                        <RadioGroup
                          className="grid grid-cols-2 gap-2"
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2">
                            <RadioGroupItem value="now" id="run-now" />
                            <label htmlFor="run-now" className="text-sm">Manual</label>
                          </div>
                          <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2">
                            <RadioGroupItem value="schedule" id="run-schedule" />
                            <label htmlFor="run-schedule" className="text-sm">Schedule</label>
                          </div>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {runWhen === "schedule" && (
                  <>
                    <FormField
                      control={form.control}
                      name="scheduledDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Scheduled Date</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                                >
                                  {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                  <CalendarClock className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={(date) => date < startOfToday()}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="scheduledTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Time (HH:MM)</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="time"
                              placeholder="14:30"
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
                          <SelectItem value="deploy">Deploy</SelectItem>
                          <SelectItem value="transport">Transport</SelectItem>
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
                      <FormLabel>
                        {action_type === "transport" ? "Source Environment" : "Environment"}
                      </FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={!app_id}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={app_id ? "Select environment" : "Select app first"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {filteredEnvironments.map((e) => (
                            <SelectItem key={e.id} value={e.environment_name}>
                              {e.environment_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {action_type === "deploy" && (
                  <>
                    <FormField
                      control={form.control}
                      name="branchName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Branch</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder={loadingBranches ? "Loading branches..." : "Select branch"} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {branches.map((b) => (
                                <SelectItem key={b} value={b}>{b}</SelectItem>
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
                          <FormLabel>Revision</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value} disabled={!branchName}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder={loadingRevisions ? "Loading commits..." : "Select revision"} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {revisions.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.id.slice(0, 8)} - {c.message}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="versionMajor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Major</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                {...field} 
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                min="0"
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
                                {...field} 
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                min="0"
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
                                {...field} 
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                min="0"
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
                            <Textarea {...field} placeholder="Deployment description" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {action_type === "transport" && (
                  <>
                    <FormField
                      control={form.control}
                      name="targetEnvironmentName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Target Environment</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value} disabled={!app_id}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder={app_id ? "Select target environment" : "Select app first"} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {filteredEnvironments.map((e) => (
                                <SelectItem key={e.id} value={e.environment_name}>
                                  {e.environment_name}
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
                            <Textarea {...field} placeholder="Optional comment for the transport action" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Update Cloud Action
                </Button>
              </form>
            </Form>

            {/* Sidebar for scheduling info */}
            <aside className="space-y-4 text-sm text-muted-foreground">
              <div>
                <h4 className="font-medium mb-2 text-foreground">Scheduling</h4>
                <p>Actions can be run immediately or scheduled for later.</p>
                <p className="mt-1">All times are displayed in your local timezone.</p>
              </div>
              <div>
                <h4 className="font-medium mb-2 text-foreground">Preview</h4>
                <div className="bg-muted/50 p-3 rounded-md space-y-2 text-xs">
                  <div><span className="font-medium">Action:</span> {action_type || "Not selected"}</div>
                  <div><span className="font-medium">Environment:</span> {form.watch("environment_name") || "Not selected"}</div>
                  {action_type === "deploy" && (
                    <>
                      <div><span className="font-medium">Branch:</span> {branchName || "Not selected"}</div>
                      <div><span className="font-medium">Revision:</span> {form.watch("revisionId") ? `${form.watch("revisionId")?.slice(0, 8)}...` : "Not selected"}</div>
                    </>
                  )}
                  {action_type === "transport" && (
                    <>
                      <div><span className="font-medium">Source:</span> {form.watch("environment_name") || "Not selected"}</div>
                      <div><span className="font-medium">Target:</span> {form.watch("targetEnvironmentName") || "Not selected"}</div>
                    </>
                  )}
                  <div><span className="font-medium">Run:</span> {(() => {
                    if (runWhen === "now") return "Immediately";
                    if (runWhen === "schedule" && scheduledDate && scheduledTime) {
                      const scheduledDateValue = new Date(scheduledDate);
                      return `${format(scheduledDateValue, "PPP")} ${scheduledTime}`;
                    }
                    return "Not scheduled";
                  })()}</div>
                  <div><span className="font-medium">Retry until:</span> {(() => {
                    const retryDate = form.watch("retryUntilDate");
                    const retryTime = form.watch("retryUntilTime");
                    if (retryDate && retryTime) {
                      return `${format(retryDate as Date, "PPP")} ${retryTime}`;
                    }
                    return "Auto-populated";
                  })()}
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
