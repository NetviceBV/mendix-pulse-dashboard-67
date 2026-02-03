import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { CalendarClock, CloudCog, Loader2, Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { format, startOfToday, isSameDay, parse } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Credential, App, Env } from "@/types/cloudActions";

interface AddCloudActionDialogProps {
  onCreated: () => void;
}

export function AddCloudActionDialog({ onCreated }: AddCloudActionDialogProps) {
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
      targetEnvironmentName: z.string().optional(),
      branchName: z.string().optional(),
      revisionId: z.string().optional(),
      revision: z.string().optional(),
      versionMajor: z.number().min(0).optional(),
      versionMinor: z.number().min(0).optional(),
      versionPatch: z.number().min(0).optional(),
      description: z.string().optional(),
      comment: z.string().optional(),
      actionType: ActionType,
      runWhen: z.enum(["now", "schedule"]).default("now"),
      scheduledDate: z.date().optional(),
      scheduledTime: z.string().optional(),
      retryUntilDate: z.date().optional(),
      retryUntilTime: z.string().optional(),
    })
    .superRefine((val, ctx) => {
      if (val.runWhen === "schedule") {
        if (!val.scheduledDate)
          ctx.addIssue({ code: "custom", message: "Date required", path: ["scheduledDate"] });
        if (!val.scheduledTime)
          ctx.addIssue({ code: "custom", message: "Time required", path: ["scheduledTime"] });

        if (val.scheduledDate && val.scheduledTime) {
          const scheduledAt = parse(val.scheduledTime, "HH:mm", val.scheduledDate);
          const now = new Date();
          if (scheduledAt <= now) {
            ctx.addIssue({ code: "custom", message: "Must be in the future", path: ["scheduledTime"] });
          }
        }
      }

      if (val.retryUntilDate && val.retryUntilTime) {
        const retryUntil = parse(val.retryUntilTime, "HH:mm", val.retryUntilDate);
        let baseTime = new Date();
        if (val.runWhen === "schedule" && val.scheduledDate && val.scheduledTime) {
          baseTime = parse(val.scheduledTime, "HH:mm", val.scheduledDate);
        }
        if (retryUntil <= new Date(baseTime.getTime() + 5 * 60 * 1000)) {
          const fromText = val.runWhen === "schedule" ? "scheduled time" : "now";
          ctx.addIssue({
            code: "custom",
            message: `Must be at least 5 minutes from ${fromText}`,
            path: ["retryUntilTime"],
          });
        }
        if (retryUntil > new Date(baseTime.getTime() + 24 * 60 * 60 * 1000)) {
          const fromText = val.runWhen === "schedule" ? "scheduled time" : "now";
          ctx.addIssue({
            code: "custom",
            message: `Cannot exceed 24 hours from ${fromText}`,
            path: ["retryUntilTime"],
          });
        }
      }

      if (val.actionType === "transport" && !val.targetEnvironmentName) {
        ctx.addIssue({
          code: "custom",
          message: "Target environment required",
          path: ["targetEnvironmentName"],
        });
      }
      if (val.actionType === "deploy") {
        if (!val.branchName)
          ctx.addIssue({ code: "custom", message: "Branch is required", path: ["branchName"] });
        if (!val.revisionId)
          ctx.addIssue({ code: "custom", message: "Revision is required", path: ["revisionId"] });
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
      targetEnvironmentName: "",
      branchName: "",
      revisionId: "",
      revision: "",
      versionMajor: 1,
      versionMinor: 0,
      versionPatch: 0,
      description: "Pintosoft deployment",
      comment: "",
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

  const isAutoPopulatingRef = useRef(false);
  const previousValuesRef = useRef<{
    runWhen?: string;
    scheduledDate?: Date;
    scheduledTime?: string;
  }>({});

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

  const filteredApps = useMemo(() => apps, [apps]);
  const filteredEnvs = useMemo(() => envs, [envs]);

  // Load credentials on dialog open
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

  // Load apps when credential changes
  useEffect(() => {
    (async () => {
      if (!credentialId) {
        setApps([]);
        return;
      }
      setLoadingApps(true);
      try {
        const { data, error } = await supabase
          .from("mendix_apps")
          .select("id, app_id, app_name, credential_id, project_id")
          .eq("credential_id", credentialId)
          .order("app_name", { ascending: true });
        if (!error) setApps((data || []) as any);
        else setApps([]);
      } finally {
        setLoadingApps(false);
      }
    })();
  }, [credentialId]);

  // Load environments when app changes
  useEffect(() => {
    (async () => {
      if (!appId || !credentialId) {
        setEnvs([]);
        return;
      }
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

  // Load branches
  useEffect(() => {
    (async () => {
      if (!open || !appId || !credentialId) {
        setBranches([]);
        return;
      }
      setLoadingBranches(true);
      try {
        const { data, error } = await supabase.functions.invoke("get-mendix-branches", {
          body: { credentialId, appId },
        });
        if (error) throw error;
        setBranches((data as any)?.branches || []);
      } catch (e: any) {
        console.error(e);
        setBranches([]);
        toast({
          title: "Failed to load branches",
          description: e.message || "Could not fetch branches",
          variant: "destructive",
        });
      } finally {
        setLoadingBranches(false);
      }
    })();
  }, [open, appId, credentialId]);

  // Load revisions when branch changes
  useEffect(() => {
    (async () => {
      if (!open || !appId || !credentialId || !branchName) {
        setRevisions([]);
        return;
      }
      setLoadingRevisions(true);
      try {
        const { data, error } = await supabase.functions.invoke("get-mendix-commits", {
          body: { credentialId, appId, branchName },
        });
        if (error) throw error;
        setRevisions(((data as any)?.commits || []) as { id: string; message: string }[]);
      } catch (e: any) {
        console.error(e);
        setRevisions([]);
        toast({
          title: "Failed to load revisions",
          description: e.message || "Could not fetch revisions",
          variant: "destructive",
        });
      } finally {
        setLoadingRevisions(false);
      }
    })();
  }, [open, appId, credentialId, branchName]);

  // Load packages when branch changes
  useEffect(() => {
    (async () => {
      if (!open || !appId || !credentialId || !branchName) {
        setPackages([]);
        return;
      }
      setLoadingPackages(true);
      try {
        const { data, error } = await supabase.functions.invoke("get-mendix-packages", {
          body: { credentialId, appId, branchName },
        });
        if (error) throw error;
        setPackages(((data as any)?.packages || []) as string[]);
      } catch (e: any) {
        console.error(e);
        setPackages([]);
      } finally {
        setLoadingPackages(false);
      }
    })();
  }, [open, appId, credentialId, branchName]);

  const filteredRevisions = useMemo(() => {
    return branchName ? revisions : [];
  }, [branchName, revisions]);

  // Reset dependent fields
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
    if (
      currentValues.environmentName !== "" ||
      currentValues.branchName !== "" ||
      currentValues.revisionId !== "" ||
      currentValues.revision !== ""
    ) {
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
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error("Authentication required");
      }

      let scheduledFor = null;
      if (values.runWhen === "schedule" && values.scheduledDate && values.scheduledTime) {
        const scheduledDateTime = parse(values.scheduledTime, "HH:mm", values.scheduledDate);
        scheduledFor = scheduledDateTime.toISOString();
      }

      let retryUntil = null;
      if (values.retryUntilDate && values.retryUntilTime) {
        const retryUntilDateTime = parse(values.retryUntilTime, "HH:mm", values.retryUntilDate);
        retryUntil = retryUntilDateTime.toISOString();
      }

      const payload: any = {
        actionType: values.actionType,
        appId: values.appId,
        environmentName: values.environmentName,
      };

      if (values.actionType === "transport") {
        payload.environmentName = values.targetEnvironmentName;
        payload.sourceEnvironmentName = values.environmentName;
        payload.comment = values.comment;
      }

      if (values.actionType === "deploy") {
        payload.branchName = values.branchName;
        payload.revisionId = values.revisionId;
        if (
          values.versionMajor !== undefined ||
          values.versionMinor !== undefined ||
          values.versionPatch !== undefined
        ) {
          const major = values.versionMajor || 0;
          const minor = values.versionMinor || 0;
          const patch = values.versionPatch || 0;
          payload.version = `${major}.${minor}.${patch}`;
        }
        payload.description = values.description;
        payload.comment = values.comment;
        const selectedRevision = revisions.find((r) => r.id === values.revisionId);
        if (selectedRevision) {
          payload.revisionMessage = selectedRevision.message;
        }
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .single();

      const { error: insertError } = await supabase.from("cloud_actions").insert({
        user_id: user.id,
        credential_id: values.credentialId,
        app_id: values.appId,
        environment_name:
          values.actionType === "transport" ? values.targetEnvironmentName : values.environmentName,
        action_type: values.actionType,
        status: values.runWhen === "now" ? "scheduled" : "scheduled",
        scheduled_for: scheduledFor,
        retry_until: retryUntil,
        payload: payload,
        creator_name: profile?.full_name || user.email || null,
      });

      if (insertError) {
        throw insertError;
      }

      const when =
        values.runWhen === "now"
          ? "Now"
          : `${values.scheduledDate ? format(values.scheduledDate, "PPP") : ""} ${values.scheduledTime || ""}`.trim();
      const appName = apps.find((a) => a.app_id === values.appId)?.app_name;
      const selectedRevision = revisions.find((r) => r.id === values.revisionId);
      const deployInfo =
        values.actionType === "deploy"
          ? ` • Branch: ${values.branchName || ""} • Revision: ${selectedRevision ? `${selectedRevision.id} - ${selectedRevision.message}` : values.revisionId || ""}`
          : "";

      toast({
        title: "Cloud action created",
        description:
          `Action: ${values.actionType.replace("_", " ")} • App: ${appName} • ` +
          (values.actionType === "transport"
            ? `Source: ${values.environmentName || ""} • Target: ${values.targetEnvironmentName || ""}`
            : `Target: ${values.environmentName}`) +
          ` • When: ${when}${deployInfo}`,
      });

      form.reset();
      setOpen(false);
      onCreated();

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
          <DialogDescription>
            Plan and queue a cloud action for your Mendix environment.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-8rem)] pr-4">
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
                            <SelectValue
                              placeholder={
                                credentialId ? "Select app (filtered)" : "Select credential first"
                              }
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {filteredApps.map((a) => (
                            <SelectItem key={a.app_id} value={a.project_id}>
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
                            <label htmlFor="run-now" className="text-sm">
                              Manual
                            </label>
                          </div>
                          <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2">
                            <RadioGroupItem value="schedule" id="run-schedule" />
                            <label htmlFor="run-schedule" className="text-sm">
                              Schedule
                            </label>
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
                                  className={cn(
                                    "w-full pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                  )}
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
                            <Input {...field} type="time" placeholder="14:30" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                <FormField
                  control={form.control}
                  name="actionType"
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
                  name="environmentName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {actionType === "transport" ? "Source Environment" : "Environment"}
                      </FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(v) => field.onChange(v)}
                        disabled={!appId}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={appId ? "Select environment" : "Select app first"}
                            />
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

                {actionType === "deploy" && (
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
                                <SelectValue
                                  placeholder={loadingBranches ? "Loading branches..." : "Select branch"}
                                />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {branches.map((b) => (
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
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                            disabled={!branchName}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={
                                    loadingRevisions ? "Loading commits..." : "Select revision"
                                  }
                                />
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

                {actionType === "transport" && (
                  <>
                    <FormField
                      control={form.control}
                      name="targetEnvironmentName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Target Environment</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value} disabled={!appId}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={
                                    appId ? "Select target environment" : "Select app first"
                                  }
                                />
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

                    <FormField
                      control={form.control}
                      name="comment"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Comment (Optional)</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="Optional comment for the transport action"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Cloud Action
                </Button>
              </form>
            </Form>

            {/* Sidebar for scheduling info */}
            <aside className="space-y-4 text-sm text-muted-foreground">
              <div>
                <h4 className="font-medium mb-2 text-foreground">Scheduling</h4>
                <p>Actions can be run immediately or scheduled for later.</p>
                <p className="mt-1">All scheduled times are in UTC.</p>
              </div>
              <div>
                <h4 className="font-medium mb-2 text-foreground">Preview</h4>
                <div className="bg-muted/50 p-3 rounded-md space-y-2 text-xs">
                  <div>
                    <span className="font-medium">Action:</span> {actionType || "Not selected"}
                  </div>
                  <div>
                    <span className="font-medium">Environment:</span>{" "}
                    {form.watch("environmentName") || "Not selected"}
                  </div>
                  {actionType === "deploy" && (
                    <>
                      <div>
                        <span className="font-medium">Branch:</span> {branchName || "Not selected"}
                      </div>
                      <div>
                        <span className="font-medium">Revision:</span>{" "}
                        {form.watch("revisionId")
                          ? `${form.watch("revisionId")?.slice(0, 8)}...`
                          : "Not selected"}
                      </div>
                    </>
                  )}
                  {actionType === "transport" && (
                    <>
                      <div>
                        <span className="font-medium">Source Environment:</span>{" "}
                        {form.watch("environmentName") || "Not selected"}
                      </div>
                      <div>
                        <span className="font-medium">Target Environment:</span>{" "}
                        {form.watch("targetEnvironmentName") || "Not selected"}
                      </div>
                    </>
                  )}
                  <div>
                    <span className="font-medium">Run:</span>{" "}
                    {(() => {
                      if (runWhen === "now") return "Immediately";
                      if (runWhen === "schedule" && scheduledDate && scheduledTime) {
                        const scheduledDateValue = new Date(scheduledDate);
                        return `${format(scheduledDateValue, "PPP")} ${scheduledTime}`;
                      }
                      return "Not scheduled";
                    })()}
                  </div>
                  <div>
                    <span className="font-medium">Retry until:</span>{" "}
                    {(() => {
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
}
