import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { LintingResult } from "@/hooks/useLintingQuery";

interface LintingDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapter: string;
  results: LintingResult[];
}

export function LintingDetailsDialog({ open, onOpenChange, chapter, results }: LintingDetailsDialogProps) {
  const chapterResults = results.filter((r) => r.chapter === chapter);
  const passed = chapterResults.filter((r) => r.status === "pass").length;
  const failed = chapterResults.filter((r) => r.status === "fail").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>{chapter} - Linting Rules</DialogTitle>
          <DialogDescription>
            {passed} passed, {failed} failed out of {chapterResults.length} rules
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-3">
            {chapterResults.map((rule) => (
              <RuleRow key={rule.id} rule={rule} />
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function RuleRow({ rule }: { rule: LintingResult }) {
  const statusIcon =
    rule.status === "pass" ? (
      <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
    ) : rule.status === "fail" ? (
      <XCircle className="h-4 w-4 text-red-500 shrink-0" />
    ) : (
      <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
    );

  return (
    <div
      className={cn(
        "p-3 rounded-md border",
        rule.status === "pass" && "bg-green-500/5 border-green-500/20",
        rule.status === "fail" && "bg-red-500/5 border-red-500/20",
        rule.status === "warning" && "bg-yellow-500/5 border-yellow-500/20"
      )}
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5">{statusIcon}</div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{rule.rule_name}</span>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0",
                rule.severity === "error" && "border-red-500/30 text-red-600",
                rule.severity === "warning" && "border-yellow-500/30 text-yellow-600",
                rule.severity === "info" && "border-blue-500/30 text-blue-600"
              )}
            >
              {rule.severity}
            </Badge>
          </div>
          {rule.rule_description && (
            <p className="text-xs text-muted-foreground">{rule.rule_description}</p>
          )}
          {rule.details && rule.status !== "pass" && (
            <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded mt-1 font-mono">
              {rule.details}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
