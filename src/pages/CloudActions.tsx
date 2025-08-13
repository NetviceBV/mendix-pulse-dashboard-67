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
  const [loading, setLoading] = useState(false);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [envs, setEnvs] = useState<Env[]>([]);

  const [credentialId, setCredentialId] = useState<string>("");
  const [appId, setAppId] = useState<string>("");
  const [environmentName, setEnvironmentName] = useState<string>("");
  const [actionType, setActionType] = useState<string>("start");
  const [scheduledFor, setScheduledFor] = useState<string>("");
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      const [{ data: creds }, { data: apps }] = await Promise.all([
        supabase.from("mendix_credentials").select("id, name"),
        supabase.from("mendix_apps").select("id, app_id, app_name, credential_id"),
      ]);
      setCredentials((creds || []) as Credential[]);
      setApps((apps || []) as App[]);
    };
    load();
  }, [open]);

  useEffect(() => {
    const loadEnv = async () => {
      if (!appId) { setEnvs([]); return; }
      const { data } = await supabase
        .from("mendix_environments")
        .select("id, app_id, environment_name")
        .eq("app_id", appId);
      setEnvs((data || []) as Env[]);
    };
    loadEnv();
  }, [appId]);

  const filteredApps = useMemo(() => {
    return credentialId ? apps.filter(a => a.credential_id === credentialId) : apps;
  }, [apps, credentialId]);

  const handleCreate = async () => {
    try {
      if (!credentialId || !appId || !environmentName || !actionType) {
        toast({ title: "Missing fields", description: "Please fill all required fields", variant: "destructive" });
        return;
      }
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const insert: any = {
        user_id: user.id,
        credential_id: credentialId,
        app_id: appId,
        environment_name: environmentName,
        action_type: actionType,
        status: "scheduled",
      };
      if (scheduledFor) insert.scheduled_for = new Date(scheduledFor).toISOString();

      const { error } = await supabase.from("cloud_actions").insert(insert);
      if (error) throw error;
      toast({ title: "Action scheduled", description: `Queued ${actionType} on ${environmentName}` });
      setOpen(false);
      setCredentialId("");
      setAppId("");
      setEnvironmentName("");
      setActionType("start");
      setScheduledFor("");
      onCreated();
    } catch (e: any) {
      toast({ title: "Could not create action", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default">
          <Plus className="mr-2 h-4 w-4" /> Add Cloud Action
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CloudCog className="h-5 w-5" /> New Cloud Action
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Credential</label>
              <Select value={credentialId} onValueChange={setCredentialId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select credential" />
                </SelectTrigger>
                <SelectContent>
                  {credentials.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Action</label>
              <Select value={actionType} onValueChange={setActionType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="start">Start</SelectItem>
                  <SelectItem value="stop">Stop</SelectItem>
                  <SelectItem value="restart">Restart</SelectItem>
                  <SelectItem value="refresh_status">Refresh status</SelectItem>
                  <SelectItem value="download_logs">Download logs</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Application</label>
            <Select value={appId} onValueChange={(v) => { setAppId(v); setEnvironmentName(""); }}>
              <SelectTrigger>
                <SelectValue placeholder={credentialId ? "Select app (filtered)" : "Select app"} />
              </SelectTrigger>
              <SelectContent>
                {filteredApps.map(a => (
                  <SelectItem key={a.app_id} value={a.app_id}>{a.app_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">Environment</label>
            <Select value={environmentName} onValueChange={setEnvironmentName}>
              <SelectTrigger>
                <SelectValue placeholder={appId ? "Select environment" : "Select an app first"} />
              </SelectTrigger>
              <SelectContent>
                {envs.map(e => (
                  <SelectItem key={e.id} value={e.environment_name}>{e.environment_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium flex items-center gap-2"><CalendarClock className="h-4 w-4"/> Schedule (optional)</label>
            <Input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
              Schedule
            </Button>
          </div>
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
      m.content = "Manage and schedule Mendix cloud actions like start, stop, restart, and status refresh.";
      document.head.appendChild(m);
    } else {
      metaDesc.setAttribute("content", "Manage and schedule Mendix cloud actions like start, stop, restart, and status refresh.");
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
