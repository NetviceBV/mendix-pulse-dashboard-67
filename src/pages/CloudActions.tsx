import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { CloudCog, Loader2, RefreshCcw, ArrowLeft, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { EditCloudActionDialog } from "@/components/EditCloudActionDialog";
import { AddCloudActionDialog } from "@/components/AddCloudActionDialog";
import { CloudActionLogsDialog } from "@/components/CloudActionLogsDialog";
import { CloudActionTableSkeleton } from "@/components/CloudActionTableSkeleton";
import { useCloudActionsQuery } from "@/hooks/useCloudActionsQuery";
import { queryKeys } from "@/lib/queryKeys";
import { statusColor } from "@/types/cloudActions";

export default function CloudActionsPage() {
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Use React Query for data fetching
  const { data, isLoading, refetch } = useCloudActionsQuery();
  const actions = data?.actions || [];
  const apps = data?.apps || [];

  useEffect(() => {
    document.title = "Cloud actions | Mendix Monitoring";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      const m = document.createElement("meta");
      m.name = "description";
      m.content =
        "Manage and schedule Mendix cloud actions like start, stop, restart, deploy, and transport.";
      document.head.appendChild(m);
    } else {
      metaDesc.setAttribute(
        "content",
        "Manage and schedule Mendix cloud actions like start, stop, restart, deploy, and transport."
      );
    }
    const link =
      document.querySelector('link[rel="canonical"]') || document.createElement("link");
    link.setAttribute("rel", "canonical");
    link.setAttribute("href", window.location.href);
    if (!link.parentNode) document.head.appendChild(link);
  }, []);

  const appName = (app_id: string) =>
    apps.find((a) => a.project_id === app_id)?.app_name || app_id;

  const triggerRunner = async (actionId?: string) => {
    if (actionId) {
      setRunningActionId(actionId);
    } else {
      setIsRunningAll(true);
    }

    try {
      const { error } = await supabase.functions.invoke("run-cloud-actions-v2", {
        body: actionId ? { actionId, processAllDue: false } : { processAllDue: true },
      });
      if (error) throw error;

      toast({
        title: actionId ? "Action triggered" : "Runner started",
        description: `${actionId ? "Processing selected action" : "Processing due actions"} (Enhanced v2)`,
      });
      
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.cloudActions });
    } catch (e: any) {
      toast({ title: "Runner failed", description: e.message, variant: "destructive" });
    } finally {
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
      queryClient.invalidateQueries({ queryKey: queryKeys.cloudActions });
    } catch (e: any) {
      toast({ title: "Cancel failed", description: e.message, variant: "destructive" });
    }
  };

  const deleteAction = async (id: string) => {
    if (!confirm("Are you sure you want to delete this cloud action?")) {
      return;
    }

    try {
      const { error } = await supabase.from("cloud_actions").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Action deleted successfully" });
      queryClient.invalidateQueries({ queryKey: queryKeys.cloudActions });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  };

  const handleActionCreated = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.cloudActions });
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
              <p className="text-sm text-muted-foreground">
                Schedule and monitor environment operations
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
              </Link>
            </Button>
            <Button variant="outline" onClick={() => triggerRunner()} disabled={isRunningAll}>
              {isRunningAll ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="mr-2 h-4 w-4" />
              )}
              {isRunningAll ? "Running..." : "Run due now"}
            </Button>
            <AddCloudActionDialog onCreated={handleActionCreated} />
          </div>
        </div>

      </header>

      <section className="container mx-auto px-4 py-6">
        <Table>
          <TableCaption>Planned and recent cloud actions</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Created</TableHead>
              <TableHead>Created By</TableHead>
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
            {isLoading && <CloudActionTableSkeleton rows={5} />}
            {!isLoading && actions.length === 0 && (
              <TableRow>
                <TableCell colSpan={10}>
                  <div className="text-sm text-muted-foreground">
                    No actions yet. Create one to get started.
                  </div>
                </TableCell>
              </TableRow>
            )}
            {!isLoading && actions.map((a) => (
              <TableRow key={a.id}>
                <TableCell>{new Date(a.created_at).toLocaleString()}</TableCell>
                <TableCell>
                  <span className="text-sm">{a.creator_name || "Unknown"}</span>
                </TableCell>
                <TableCell>{appName(a.app_id)}</TableCell>
                <TableCell>{a.environment_name}</TableCell>
                <TableCell className="capitalize">{a.action_type}</TableCell>
                <TableCell>
                  {a.scheduled_for ? new Date(a.scheduled_for).toLocaleString() : "—"}
                </TableCell>
                <TableCell>
                  <span className={`px-2 py-1 rounded text-xs ${statusColor[a.status] || "bg-muted"}`}>
                    {a.status}
                  </span>
                </TableCell>
                <TableCell>
                  {a.started_at ? new Date(a.started_at).toLocaleString() : "—"}
                </TableCell>
                <TableCell>
                  {a.completed_at ? new Date(a.completed_at).toLocaleString() : "—"}
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <CloudActionLogsDialog actionId={a.id} />
                  {a.status === "scheduled" && (
                    <>
                      <EditCloudActionDialog action={a} onUpdated={handleActionCreated} />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => triggerRunner(a.id)}
                        disabled={runningActionId === a.id}
                      >
                        {runningActionId === a.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        {runningActionId === a.id ? "Running..." : "Run now"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => cancel(a.id)}>
                        Cancel
                      </Button>
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
