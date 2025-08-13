import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CalendarClock, CloudCog, Loader2, Plus, RefreshCcw, ScrollText } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { format } from "date-fns";


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
  scheduled: "bg-muted text-foreground",
  running: "bg-primary text-primary-foreground",
  succeeded: "bg-green-600 text-primary-foreground",
  failed: "bg-destructive text-destructive-foreground",
  canceled: "bg-muted text-muted-foreground",
};

function AddCloudActionDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  // UI-only placeholder data
  const PLACEHOLDER_CREDENTIALS: Credential[] = [
    { id: "cred1", name: "Production Credentials" },
    { id: "cred2", name: "Dev/Test Credentials" },
  ];
  const PLACEHOLDER_APPS: App[] = [
    { id: "1", app_id: "mx-app-001", app_name: "Customer Portal", credential_id: "cred1" },
    { id: "2", app_id: "mx-app-002", app_name: "Backoffice Suite", credential_id: "cred1" },
    { id: "3", app_id: "mx-app-101", app_name: "QA Sandbox", credential_id: "cred2" },
  ];
  const PLACEHOLDER_ENVS: Env[] = [
    { id: "e1", app_id: "mx-app-001", environment_name: "production" },
    { id: "e2", app_id: "mx-app-001", environment_name: "acceptance" },
    { id: "e3", app_id: "mx-app-002", environment_name: "production" },
    { id: "e4", app_id: "mx-app-002", environment_name: "test" },
    { id: "e5", app_id: "mx-app-101", environment_name: "test" },
    { id: "e6", app_id: "mx-app-101", environment_name: "acceptance" },
  ];

  const PLACEHOLDER_BRANCHES: Record<string, string[]> = {
    "mx-app-001": ["main", "develop"],
    "mx-app-002": ["main"],
    "mx-app-101": ["develop", "feature/new-ui"],
  };

  const PLACEHOLDER_REVISIONS: Record<string, string[]> = {
    "mx-app-001:main": ["v1.2.3", "v1.2.2", "v1.2.1"],
    "mx-app-001:develop": ["v1.3.0-beta1", "v1.3.0-alpha2"],
    "mx-app-002:main": ["v2.0.0", "v1.9.5"],
    "mx-app-101:develop": ["r105", "r104"],
    "mx-app-101:feature/new-ui": ["r201", "r200"],
  };

  const ActionType = z.enum(["start", "stop", "restart", "transport", "deploy"]);
const FormSchema = z
    .object({
      credentialId: z.string().min(1, "Select credential"),
      appId: z.string().min(1, "Select app"),
      environmentName: z.string().min(1, "Select environment"),
      sourceEnvironmentName: z.string().optional(),
      branchName: z.string().optional(),
      revision: z.string().optional(),
      actionType: ActionType,
      runWhen: z.enum(["now", "schedule"]).default("now"),
      scheduledDate: z.date().optional(),
      scheduledTime: z.string().optional(), // HH:mm
    })
    .superRefine((val, ctx) => {
      if (val.runWhen === "schedule") {
        if (!val.scheduledDate) ctx.addIssue({ code: "custom", message: "Date required", path: ["scheduledDate"] });
        if (!val.scheduledTime) ctx.addIssue({ code: "custom", message: "Time required", path: ["scheduledTime"] });
      }
      if (val.actionType === "transport" && !val.sourceEnvironmentName) {
        ctx.addIssue({ code: "custom", message: "Source environment required", path: ["sourceEnvironmentName"] });
      }
      if (val.actionType === "deploy") {
        if (!val.branchName) ctx.addIssue({ code: "custom", message: "Branch is required", path: ["branchName"] });
        if (!val.revision) ctx.addIssue({ code: "custom", message: "Revision is required", path: ["revision"] });
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
      revision: "",
      actionType: "start",
      runWhen: "now",
      scheduledDate: undefined,
      scheduledTime: "",
    },
  });

  const credentialId = form.watch("credentialId");
  const appId = form.watch("appId");
  const actionType = form.watch("actionType");
  const runWhen = form.watch("runWhen");

  const filteredApps = useMemo(() => {
    return credentialId ? PLACEHOLDER_APPS.filter((a) => a.credential_id === credentialId) : PLACEHOLDER_APPS;
  }, [credentialId]);
  const filteredEnvs = useMemo(() => {
    return appId ? PLACEHOLDER_ENVS.filter((e) => e.app_id === appId) : [];
  }, [appId]);
  const filteredBranches = useMemo(() => {
    return appId ? (PLACEHOLDER_BRANCHES[appId] || []) : [];
  }, [appId]);
  const branchName = form.watch("branchName");
  const filteredRevisions = useMemo(() => {
    return appId && branchName ? (PLACEHOLDER_REVISIONS[`${appId}:${branchName}`] || []) : [];
  }, [appId, branchName]);

  // Reset dependent fields
  useEffect(() => {
    form.setValue("appId", "");
    form.setValue("environmentName", "");
  }, [credentialId]);
  useEffect(() => {
    form.setValue("environmentName", "");
    form.setValue("branchName", "");
    form.setValue("revision", "");
  }, [appId]);

  useEffect(() => {
    form.setValue("revision", "");
  }, [branchName]);

  const onSubmit = (values: FormValues) => {
    const when =
      values.runWhen === "now"
        ? "Now"
        : `${values.scheduledDate ? format(values.scheduledDate, "PPP") : ""} ${values.scheduledTime || ""}`.trim();
    const credName = PLACEHOLDER_CREDENTIALS.find((c) => c.id === values.credentialId)?.name;
    const appName = PLACEHOLDER_APPS.find((a) => a.app_id === values.appId)?.app_name;
    const deployInfo =
      values.actionType === "deploy"
        ? ` • Branch: ${values.branchName || ""} • Revision: ${values.revision || ""}`
        : "";

    toast({
      title: "Cloud action prepared",
      description:
        `Action: ${values.actionType.replace("_", " ")} • App: ${appName} • ` +
        (values.actionType === "transport"
          ? `Source: ${values.sourceEnvironmentName || ""} • Target: ${values.environmentName}`
          : `Target: ${values.environmentName}`) +
        ` • When: ${when}${deployInfo}`,
    });
    setOpen(false);
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
                        {PLACEHOLDER_CREDENTIALS.map((c) => (
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
                          <Input type="time" value={field.value} onChange={field.onChange} />
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
                              <SelectValue placeholder={appId ? "Select branch" : "Select an app first"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {filteredBranches.map((b) => (
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
                    name="revision"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Revision</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange} disabled={!appId || !branchName}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={branchName ? "Select revision" : "Select a branch first"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {filteredRevisions.map((r) => (
                              <SelectItem key={r} value={r}>
                                {r}
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

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!form.formState.isValid}>
                  Prepare action
                </Button>
              </div>
            </form>
          </Form>

          <aside className="rounded-lg border border-border bg-card/50 p-4 space-y-3">
            <div className="text-sm text-muted-foreground">Summary</div>
            <div className="text-sm">
              <div>
                <span className="text-muted-foreground">Credential:</span> {credentialId ? (PLACEHOLDER_CREDENTIALS.find(c => c.id === credentialId)?.name || credentialId) : "—"}
              </div>
              <div>
                <span className="text-muted-foreground">App:</span> {appId ? (PLACEHOLDER_APPS.find(a => a.app_id === appId)?.app_name || appId) : "—"}
              </div>
              {actionType === "transport" && (
                <div>
                  <span className="text-muted-foreground">Source environment:</span> {form.watch("sourceEnvironmentName") || "—"}
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Target environment:</span> {form.watch("environmentName") || "—"}
              </div>
              <div className="capitalize">
                <span className="text-muted-foreground">Action:</span> {actionType.replace("_", " ")}
              </div>
              <div>
                <span className="text-muted-foreground">When:</span> {runWhen === "now" ? "Now" : `${form.watch("scheduledDate") ? format(form.watch("scheduledDate") as Date, "PPP") : "—"} ${form.watch("scheduledTime") || ""}`}
              </div>
              {actionType === "deploy" && (
                <>
                  <div>
                    <span className="text-muted-foreground">Branch:</span> {form.watch("branchName") || "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Revision:</span> {form.watch("revision") || "—"}
                  </div>
                </>
              )}
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
    try {
      const { error } = await supabase.functions.invoke("run-cloud-actions", {
        body: actionId ? { actionId, processAllDue: false } : { processAllDue: true },
      });
      if (error) throw error;
      toast({ title: actionId ? "Action triggered" : "Runner started", description: actionId ? "Processing selected action" : "Processing due actions" });
      await load();
    } catch (e: any) {
      toast({ title: "Runner failed", description: e.message, variant: "destructive" });
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
            <Button variant="outline" onClick={() => triggerRunner()}>
              <RefreshCcw className="mr-2 h-4 w-4"/> Run due now
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
                      <Button variant="outline" size="sm" onClick={() => triggerRunner(a.id)}>Run now</Button>
                      <Button variant="outline" size="sm" onClick={() => cancel(a.id)}>Cancel</Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </main>
  );
}
