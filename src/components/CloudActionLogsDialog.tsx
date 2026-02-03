import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollText } from "lucide-react";

interface CloudActionLogsDialogProps {
  actionId: string;
}

export function CloudActionLogsDialog({ actionId }: CloudActionLogsDialogProps) {
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
          <ScrollText className="mr-2 h-4 w-4" /> Logs
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Execution logs</DialogTitle>
          <DialogDescription>
            Live and historical logs for the selected action.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto space-y-2 pr-1">
          {logs.length === 0 && (
            <div className="text-sm text-muted-foreground">No logs yet</div>
          )}
          {logs.map((l, idx) => (
            <div key={idx} className="text-sm">
              <span className="text-muted-foreground">
                {new Date(l.created_at).toLocaleString()} • {l.level.toUpperCase()}
              </span>
              <div>{l.message}</div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
