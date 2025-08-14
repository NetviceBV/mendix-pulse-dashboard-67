import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CalendarClock, CloudCog, Loader2, Plus, RefreshCcw, ScrollText, ArrowLeft, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { useRef, useCallback } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { format, startOfToday, isSameDay, parse } from "date-fns";
import { Link } from "react-router-dom";


interface CloudActionRow {
  id: string;
  user_id: string;
  credential_id: string;
  app_id: string;
  environment_name: string;
  action_type: string;
  status: string;
  scheduled_for: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
}

interface Credential { id: string; name: string; }
interface App { id: string; app_id: string; app_name: string; credential_id: string; }
interface Env { id: string; app_id: string; environment_name: string; }

const statusColor: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  running: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  succeeded: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  canceled: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  error: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

function AddCloudActionDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // Data from Supabase
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [envs, setEnvs] = useState<Env[]>([]);
  const [loadingCreds, setLoadingCreds] = useState(false);
  const [loadingApps, setLoadingApps] = useState(false);
  const [loadingEnvs, setLoadingEnvs] = useState(false);

  const [branches, setBranches] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [revisions, setRevisions] = useState<{ id: string; message: string }[]>([]);
  const [loadingRevisions, setLoadingRevisions] = useState(false);
  const [packages, setPackages] = useState<string[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);

  const ActionType = z.enum(["start", "stop", "restart", "transport", "deploy"]);
const FormSchema = z
    .object({
      credentialId: z.string().min(1, "Select credential"),
      appId: z.string().min(1, "Select app"),
      environmentName: z.string().min(1, "Select environment"),
      sourceEnvironmentName: z.string().optional(),
      branchName: z.string().optional(),
      revisionId: z.string().optional(),
      revision: z.string().optional(),
      actionType: ActionType,
      runWhen: z.enum(["now", "schedule"]).default("now"),
      scheduledDate: z.date().optional(),
      scheduledTime: z.string().optional(), // HH:mm
      retryUntilDate: z.date().optional(),
      retryUntilTime: z.string().optional(), // HH:mm
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
      
      if (val.actionType === "transport" && !val.sourceEnvironmentName) {
        ctx.addIssue({ code: "custom", message: "Source environment required", path: ["sourceEnvironmentName"] });
      }
      if (val.actionType === "deploy") {
        if (!val.branchName) ctx.addIssue({ code: "custom", message: "Branch is required", path: ["branchName"] });
        if (!val.revisionId) ctx.addIssue({ code: "custom", message: "Revision is required", path: ["revisionId"] });
      }
    });

  type FormValues = z.infer<typeof FormSchema>;

const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    mode: "onChange",
      defaultValues: {
      credentialId: "",
      appId: "",
      environmentName: "",
      sourceEnvironmentName: "",
      branchName: "",
      revisionId: "",
      revision: "",
      actionType: "start",
      runWhen: "now",
      scheduledDate: undefined,
      scheduledTime: "",
      retryUntilDate: undefined,
      retryUntilTime: "",
    },
  });

  const credentialId = form.watch("credentialId");
  const appId = form.watch("appId");
  const actionType = form.watch("actionType");
  const runWhen = form.watch("runWhen");
  const scheduledDate = form.watch("scheduledDate");
  const scheduledTime = form.watch("scheduledTime");
  const retryUntilDate = form.watch("retryUntilDate");
  const minTime = useMemo(() => {
    if (!scheduledDate) return undefined;
    if (!isSameDay(scheduledDate as Date, new Date())) return undefined;
    return format(new Date(), "HH:mm");
  }, [scheduledDate]);

  const minRetryTime = useMemo(() => {
    if (!retryUntilDate) return undefined;
    if (!isSameDay(retryUntilDate as Date, new Date())) return undefined;
    return format(new Date(Date.now() + 5 * 60 * 1000), "HH:mm"); // 5 minutes from now
  }, [retryUntilDate]);

  // Refs to prevent infinite loops
  const isAutoPopulatingRef = useRef(false);
  const previousValuesRef = useRef<{runWhen?: string, scheduledDate?: Date, scheduledTime?: string}>({});

  // Auto-populate retry until when schedule changes
  useEffect(() => {
    if (isAutoPopulatingRef.current) return;
    
    const prevValues = previousValuesRef.current;
    const hasChanged = prevValues.runWhen !== runWhen || 
                      prevValues.scheduledDate !== scheduledDate || 
                      prevValues.scheduledTime !== scheduledTime;
    
    if (!hasChanged) return;
    
    isAutoPopulatingRef.current = true;
    
    if (runWhen === "now") {
      const now = new Date();
      const retryUntil = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes from now
      form.setValue("retryUntilDate", retryUntil);
      form.setValue("retryUntilTime", format(retryUntil, "HH:mm"));
      // Auto-fill schedule with current time for "run now"
      form.setValue("scheduledDate", now);
      form.setValue("scheduledTime", format(now, "HH:mm"));
    } else if (runWhen === "schedule" && scheduledDate && scheduledTime) {
      const scheduledAt = parse(scheduledTime, "HH:mm", scheduledDate);
      const retryUntil = new Date(scheduledAt.getTime() + 30 * 60 * 1000); // 30 minutes after scheduled
      form.setValue("retryUntilDate", retryUntil);
      form.setValue("retryUntilTime", format(retryUntil, "HH:mm"));
    }
    
    previousValuesRef.current = { runWhen, scheduledDate, scheduledTime };
    isAutoPopulatingRef.current = false;
  }, [runWhen, scheduledDate, scheduledTime, form]);

  const filteredApps = useMemo(() => {
    return apps;
  }, [apps]);
  const filteredEnvs = useMemo(() => {
    return envs;
  }, [envs]);
  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoadingCreds(true);
      try {
        const { data, error } = await supabase
          .from("mendix_credentials")
          .select("id, name")
          .order("created_at", { ascending: true });
        if (!error) setCredentials((data || []) as any);
      } finally {
        setLoadingCreds(false);
      }
    })();
  }, [open]);

  useEffect(() => {
    (async () => {
      if (!credentialId) { setApps([]); return; }
      setLoadingApps(true);
      try {
        const { data, error } = await supabase
          .from("mendix_apps")
          .select("id, app_id, app_name, credential_id")
          .eq("credential_id", credentialId)
          .order("app_name", { ascending: true });
        if (!error) setApps((data || []) as any);
        else setApps([]);
      } finally {
        setLoadingApps(false);
      }
    })();
  }, [credentialId]);

  useEffect(() => {
    (async () => {
      if (!appId || !credentialId) { setEnvs([]); return; }
      setLoadingEnvs(true);
      try {
        const { data, error } = await supabase
          .from("mendix_environments")
          .select("id, app_id, environment_name")
          .eq("credential_id", credentialId)
          .eq("app_id", appId)
          .order("environment_name", { ascending: true });
        if (!error) setEnvs((data || []) as any);
        else setEnvs([]);
      } finally {
        setLoadingEnvs(false);
      }
    })();
  }, [appId, credentialId]);

  useEffect(() => {
    (async () => {
      if (!appId || !credentialId) { setBranches([]); return; }
      setLoadingBranches(true);
      try {
        const { data, error } = await supabase.functions.invoke('get-mendix-branches', {
          body: { credentialId, appId },
        });
        if (error) throw error;
        setBranches((data as any)?.branches || []);
      } catch (e: any) {
        console.error(e);
        setBranches([]);
        toast({ title: 'Failed to load branches', description: e.message || 'Could not fetch branches', variant: 'destructive' });
      } finally {
        setLoadingBranches(false);
      }
    })();
  }, [appId, credentialId]);

  const branchName = form.watch("branchName");

  // Load revisions when branch changes
  useEffect(() => {
    (async () => {
      if (!appId || !credentialId || !branchName) { setRevisions([]); return; }
      setLoadingRevisions(true);
      try {
        const { data, error } = await supabase.functions.invoke('get-mendix-commits', {
          body: { credentialId, appId, branchName },
        });
        if (error) throw error;
        setRevisions(((data as any)?.commits || []) as { id: string; message: string }[]);
      } catch (e: any) {
        console.error(e);
        setRevisions([]);
        toast({ title: 'Failed to load revisions', description: e.message || 'Could not fetch revisions', variant: 'destructive' });
      } finally {
        setLoadingRevisions(false);
      }
    })();
  }, [appId, credentialId, branchName]);

  // Load packages when branch changes (keep for future use)
  useEffect(() => {
    (async () => {
      if (!appId || !credentialId || !branchName) { setPackages([]); return; }
      setLoadingPackages(true);
      try {
        const { data, error } = await supabase.functions.invoke('get-mendix-packages', {
          body: { credentialId, appId, branchName },
        });
        if (error) throw error;
        setPackages(((data as any)?.packages || []) as string[]);
      } catch (e: any) {
        console.error(e);
        setPackages([]);
        // Don't show toast for packages since we're not using them in UI
      } finally {
        setLoadingPackages(false);
      }
    })();
  }, [appId, credentialId, branchName]);

  const filteredRevisions = useMemo(() => {
    return branchName ? revisions : [];
  }, [branchName, revisions]);

  // Reset dependent fields with callbacks to prevent infinite loops
  const resetAppFields = useCallback(() => {
    const currentAppId = form.getValues("appId");
    const currentEnvName = form.getValues("environmentName");
    if (currentAppId !== "" || currentEnvName !== "") {
      form.setValue("appId", "");
      form.setValue("environmentName", "");
    }
  }, [form]);

  const resetEnvAndBranchFields = useCallback(() => {
    const currentValues = form.getValues();
    if (currentValues.environmentName !== "" || currentValues.branchName !== "" || 
        currentValues.revisionId !== "" || currentValues.revision !== "") {
      form.setValue("environmentName", "");
      form.setValue("branchName", "");
      form.setValue("revisionId", "");
      form.setValue("revision", "");
    }
  }, [form]);

  const resetRevisionFields = useCallback(() => {
    const currentValues = form.getValues();
    if (currentValues.revisionId !== "" || currentValues.revision !== "") {
      form.setValue("revisionId", "");
      form.setValue("revision", "");
    }
    setRevisions([]);
    setPackages([]);
  }, [form]);

  useEffect(() => {
    resetAppFields();
  }, [credentialId, resetAppFields]);

  useEffect(() => {
    resetEnvAndBranchFields();
  }, [appId, resetEnvAndBranchFields]);

  useEffect(() => {
    resetRevisionFields();
  }, [branchName, resetRevisionFields]);

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error("Authentication required");
      }

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
        actionType: values.actionType,
        appId: values.appId,
        environmentName: values.environmentName,
      };

      if (values.actionType === "transport") {
        payload.sourceEnvironmentName = values.sourceEnvironmentName;
      }

      if (values.actionType === "deploy") {
        payload.branchName = values.branchName;
        payload.revisionId = values.revisionId;
        const selectedRevision = revisions.find(r => r.id === values.revisionId);
        if (selectedRevision) {
          payload.revisionMessage = selectedRevision.message;
        }
      }

      // Insert into cloud_actions table
      const { error: insertError } = await supabase
        .from("cloud_actions")
        .insert({
          user_id: user.id,
          credential_id: values.credentialId,
          app_id: values.appId,
          environment_name: values.environmentName,
          action_type: values.actionType,
          status: values.runWhen === "now" ? "scheduled" : "scheduled",
          scheduled_for: scheduledFor,
          retry_until: retryUntil,
          payload: payload,
        });

      if (insertError) {
        throw insertError;
      }

      // Show success message
      const when = values.runWhen === "now" ? "Now" : 
        `${values.scheduledDate ? format(values.scheduledDate, "PPP") : ""} ${values.scheduledTime || ""}`.trim();
      const appName = apps.find((a) => a.app_id === values.appId)?.app_name;
      const selectedRevision = revisions.find(r => r.id === values.revisionId);
      const deployInfo = values.actionType === "deploy"
        ? ` • Branch: ${values.branchName || ""} • Revision: ${selectedRevision ? `${selectedRevision.id} - ${selectedRevision.message}` : values.revisionId || ""}`
        : "";

      toast({
        title: "Cloud action created",
        description:
          `Action: ${values.actionType.replace("_", " ")} • App: ${appName} • ` +
          (values.actionType === "transport"
            ? `Source: ${values.sourceEnvironmentName || ""} • Target: ${values.environmentName}`
            : `Target: ${values.environmentName}`) +
          ` • When: ${when}${deployInfo}`,
      });

      // Reset form and close dialog
      form.reset();
      setOpen(false);
      onCreated(); // Refresh the actions list
      
      // If scheduled for now, trigger the runner immediately
      if (values.runWhen === "now") {
        try {
          await supabase.functions.invoke("run-cloud-actions", {
            body: { processAllDue: true },
          });
          toast({
            title: "Action triggered",
            description: "The action has been queued for immediate execution",
          });
        } catch (runError: any) {
          console.error("Failed to trigger runner:", runError);
          toast({
            title: "Action saved but not triggered",
            description: "You can manually trigger it from the actions list",
            variant: "destructive",
          });
        }
      }

    } catch (error: any) {
      console.error("Failed to create action:", error);
      toast({
        title: "Failed to create action",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default">
          <Plus className="mr-2 h-4 w-4" /> Add Cloud Action
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CloudCog className="h-5 w-5" /> New Cloud Action
          </DialogTitle>
          <DialogDescription>Plan and queue a cloud action for your Mendix environment.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[1fr_280px]">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="credentialId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Credential</FormLabel>
                    <Select value={field.value} onValueChange={(v) => field.onChange(v)}>
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
                name="appId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Application</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(v) => field.onChange(v)}
                      disabled={!credentialId}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={credentialId ? "Select app (filtered)" : "Select credential first"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {filteredApps.map((a) => (
                          <SelectItem key={a.app_id} value={a.app_id}>
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
                    <FormLabel className="flex items-center gap-2"><CalendarClock className="h-4 w-4" />When to run</FormLabel>
                    <FormControl>
                      <RadioGroup
                        className="grid grid-cols-2 gap-2"
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2">
                          <RadioGroupItem value="now" id="run-now" />
                          <label htmlFor="run-now" className="text-sm">Run now</label>
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="scheduledDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Schedule date</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant={"outline"}
                                  className={cn(
                                    "justify-start text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                  )}
                                >
                                  {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={{ before: startOfToday() }}
                                initialFocus
                                className={cn("p-3 pointer-events-auto")}
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
                          <FormLabel>Schedule time</FormLabel>
                          <FormControl>
                            <Input type="time" value={field.value} onChange={field.onChange} min={minTime} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="retryUntilDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Retry deadline (date)</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant={"outline"}
                                  className={cn(
                                    "justify-start text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                  )}
                                >
                                  {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={{ before: startOfToday() }}
                                initialFocus
                                className={cn("p-3 pointer-events-auto")}
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="retryUntilTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Retry deadline (time)</FormLabel>
                          <FormControl>
                            <Input 
                              type="time" 
                              value={field.value} 
                              onChange={field.onChange} 
                              min={minRetryTime}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </>
              )}

              {runWhen === "now" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="retryUntilDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Retry deadline (date)</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "justify-start text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={{ before: startOfToday() }}
                              initialFocus
                              className={cn("p-3 pointer-events-auto")}
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="retryUntilTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Retry deadline (time)</FormLabel>
                        <FormControl>
                          <Input 
                            type="time" 
                            value={field.value} 
                            onChange={field.onChange} 
                            min={minRetryTime}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              <FormField
                control={form.control}
                name="actionType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Action</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select action" />
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

              {actionType === "transport" && (
                <FormField
                  control={form.control}
                  name="sourceEnvironmentName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Source environment</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange} disabled={!appId}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={appId ? "Select source environment" : "Select an app first"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {filteredEnvs.map((e) => (
                            <SelectItem key={`src-${e.id}`} value={e.environment_name}>
                              {e.environment_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {actionType === "deploy" && (
                <>
                  <FormField
                    control={form.control}
                    name="branchName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Branch</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange} disabled={!appId}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={appId ? (loadingBranches ? "Loading branches..." : "Select branch") : "Select an app first"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {loadingBranches && <SelectItem disabled value="__loading">Loading branches...</SelectItem>}
                            {!loadingBranches && branches.length === 0 && <SelectItem disabled value="__empty">No branches found</SelectItem>}
                            {!loadingBranches && branches.map((b) => (
                              <SelectItem key={b} value={b}>
                                {b}
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
                        <FormLabel>Revision</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange} disabled={!appId || !branchName}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={branchName ? (loadingRevisions ? "Loading revisions..." : "Select revision") : "Select a branch first"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {loadingRevisions && <SelectItem disabled value="__loading">Loading revisions...</SelectItem>}
                            {!loadingRevisions && filteredRevisions.length === 0 && <SelectItem disabled value="__empty">No revisions found</SelectItem>}
                            {!loadingRevisions && filteredRevisions.map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                {r.id} - {r.message}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

               <FormField
                control={form.control}
                name="environmentName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target environment</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange} disabled={!appId}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={appId ? "Select target environment" : "Select an app first"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {filteredEnvs.map((e) => (
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


              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!form.formState.isValid || isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {form.watch("runWhen") === "now" ? "Creating & Running..." : "Creating..."}
                    </>
                  ) : (
                    form.watch("runWhen") === "now" ? "Create & Run Now" : "Create Action"
                  )}
                </Button>
              </div>
            </form>
          </Form>

          <aside className="rounded-lg border border-border bg-card/50 p-4 space-y-3">
            <div className="text-sm text-muted-foreground">Summary</div>
            <div className="text-sm">
              <div>
                <span className="text-muted-foreground">Credential:</span> {credentialId ? (credentials.find(c => c.id === credentialId)?.name || credentialId) : "—"}
              </div>
              <div>
                <span className="text-muted-foreground">App:</span> {appId ? (apps.find(a => a.app_id === appId)?.app_name || appId) : "—"}
              </div>
              <div className="capitalize">
                <span className="text-muted-foreground">Action:</span> {actionType.replace("_", " ")}
              </div>
              <div>
                <span className="text-muted-foreground">When:</span> {runWhen === "now" ? "Now" : `${form.watch("scheduledDate") ? format(form.watch("scheduledDate") as Date, "PPP") : "—"} ${form.watch("scheduledTime") || ""}`}
              </div>
              {actionType === "transport" && (
                <div>
                  <span className="text-muted-foreground">Source environment:</span> {form.watch("sourceEnvironmentName") || "—"}
                </div>
              )}
              {actionType === "deploy" && (
                <>
                  <div>
                    <span className="text-muted-foreground">Branch:</span> {form.watch("branchName") || "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Revision:</span> {(() => {
                      const revisionId = form.watch("revisionId");
                      const selectedRevision = revisions.find(r => r.id === revisionId);
                      return selectedRevision ? `${selectedRevision.id} - ${selectedRevision.message}` : revisionId || "—";
                    })()}
                  </div>
                </>
              )}
              <div>
                <span className="text-muted-foreground">Target environment:</span> {form.watch("environmentName") || "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Retry until:</span> {(() => {
                  const retryDate = form.watch("retryUntilDate");
                  const retryTime = form.watch("retryUntilTime");
                  if (retryDate && retryTime) {
                    return `${format(retryDate as Date, "PPP")} ${retryTime}`;
                  }
                  return "Auto-populated";
                })()}
              </div>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LogsDialog({ actionId }: { actionId: string }) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<{ created_at: string; level: string; message: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      const { data } = await supabase
        .from("cloud_action_logs")
        .select("created_at, level, message")
        .eq("action_id", actionId)
        .order("created_at", { ascending: true });
      setLogs((data || []) as any);
    };
    load();
  }, [open, actionId]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ScrollText className="mr-2 h-4 w-4"/> Logs
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Execution logs</DialogTitle>
          <DialogDescription>Live and historical logs for the selected action.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto space-y-2 pr-1">
          {logs.length === 0 && <div className="text-sm text-muted-foreground">No logs yet</div>}
          {logs.map((l, idx) => (
            <div key={idx} className="text-sm">
              <span className="text-muted-foreground">{new Date(l.created_at).toLocaleString()} • {l.level.toUpperCase()}</span>
              <div>{l.message}</div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CloudActionsPage() {
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<CloudActionRow[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    document.title = "Cloud actions | Mendix Monitoring";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      const m = document.createElement("meta");
      m.name = "description";
      m.content = "Manage and schedule Mendix cloud actions like start, stop, restart, deploy, and transport.";
      document.head.appendChild(m);
    } else {
      metaDesc.setAttribute("content", "Manage and schedule Mendix cloud actions like start, stop, restart, deploy, and transport.");
    }
    const link = document.querySelector('link[rel="canonical"]') || document.createElement('link');
    link.setAttribute('rel','canonical');
    link.setAttribute('href', window.location.href);
    if (!link.parentNode) document.head.appendChild(link);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: actions }, { data: apps }] = await Promise.all([
        supabase
          .from("cloud_actions")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("mendix_apps")
          .select("id, app_id, app_name, credential_id"),
      ]);
      setActions((actions || []) as any);
      setApps((apps || []) as any);
    } catch (e) {
      console.error(e);
      toast({ title: "Failed to load actions", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const appName = (app_id: string) => apps.find(a => a.app_id === app_id)?.app_name || app_id;

  const triggerRunner = async (actionId?: string) => {
    // Set loading state
    if (actionId) {
      setRunningActionId(actionId);
    } else {
      setIsRunningAll(true);
    }

    try {
      const { error } = await supabase.functions.invoke("run-cloud-actions", {
        body: actionId ? { actionId, processAllDue: false } : { processAllDue: true },
      });
      if (error) throw error;
      toast({ title: actionId ? "Action triggered" : "Runner started", description: actionId ? "Processing selected action" : "Processing due actions" });
      await load();
    } catch (e: any) {
      toast({ title: "Runner failed", description: e.message, variant: "destructive" });
    } finally {
      // Clear loading state
      if (actionId) {
        setRunningActionId(null);
      } else {
        setIsRunningAll(false);
      }
    }
  };

  const cancel = async (id: string) => {
    try {
      const { error } = await supabase
        .from("cloud_actions")
        .update({ status: "canceled" })
        .eq("id", id)
        .eq("status", "scheduled");
      if (error) throw error;
      toast({ title: "Action canceled" });
      await load();
    } catch (e: any) {
      toast({ title: "Cancel failed", description: e.message, variant: "destructive" });
    }
  };

  const deleteAction = async (id: string) => {
    if (!confirm("Are you sure you want to delete this cloud action?")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("cloud_actions")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast({ title: "Action deleted successfully" });
      await load();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
              <CloudCog className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Cloud actions</h1>
              <p className="text-sm text-muted-foreground">Schedule and monitor environment operations</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/">
                <ArrowLeft className="mr-2 h-4 w-4"/> Back to Dashboard
              </Link>
            </Button>
            <Button variant="outline" onClick={() => triggerRunner()} disabled={isRunningAll}>
              {isRunningAll ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin"/>
              ) : (
                <RefreshCcw className="mr-2 h-4 w-4"/>
              )}
              {isRunningAll ? "Running..." : "Run due now"}
            </Button>
            <AddCloudActionDialog onCreated={load} />
          </div>
        </div>
      </header>

      <section className="container mx-auto px-4 py-6">
        <Table>
          <TableCaption>Planned and recent cloud actions</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Created</TableHead>
              <TableHead>App</TableHead>
              <TableHead>Environment</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Scheduled for</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Completed</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={9}>
                  <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/> Loading...</div>
                </TableCell>
              </TableRow>
            )}
            {!loading && actions.length === 0 && (
              <TableRow>
                <TableCell colSpan={9}>
                  <div className="text-sm text-muted-foreground">No actions yet. Create one to get started.</div>
                </TableCell>
              </TableRow>
            )}
            {actions.map(a => (
              <TableRow key={a.id}>
                <TableCell>{new Date(a.created_at).toLocaleString()}</TableCell>
                <TableCell>{appName(a.app_id)}</TableCell>
                <TableCell>{a.environment_name}</TableCell>
                <TableCell className="capitalize">{a.action_type}</TableCell>
                <TableCell>{a.scheduled_for ? new Date(a.scheduled_for).toLocaleString() : "—"}</TableCell>
                <TableCell>
                  <span className={`px-2 py-1 rounded text-xs ${statusColor[a.status] || "bg-muted"}`}>{a.status}</span>
                </TableCell>
                <TableCell>{a.started_at ? new Date(a.started_at).toLocaleString() : "—"}</TableCell>
                <TableCell>{a.completed_at ? new Date(a.completed_at).toLocaleString() : "—"}</TableCell>
                <TableCell className="text-right space-x-2">
                  <LogsDialog actionId={a.id} />
                  {a.status === "scheduled" && (
                    <>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => triggerRunner(a.id)}
                        disabled={runningActionId === a.id}
                      >
                        {runningActionId === a.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                        ) : null}
                        {runningActionId === a.id ? "Running..." : "Run now"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => cancel(a.id)}>Cancel</Button>
                    </>
                  )}
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => deleteAction(a.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </main>
  );
}
