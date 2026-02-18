import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle, XCircle, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useLintingRunsQuery, useLintingRunResultsQuery, type LintingRun } from "@/hooks/useLintingQuery";
import { LintingChapterGrid } from "./LintingChapterGrid";
import { LintingDetailsDialog } from "./LintingDetailsDialog";

interface LintingRunHistoryProps {
  appId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LintingRunHistory({ appId, open, onOpenChange }: LintingRunHistoryProps) {
  const { data: runs, isLoading } = useLintingRunsQuery(appId);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const { data: runResults, isLoading: resultsLoading } = useLintingRunResultsQuery(selectedRunId);

  const selectedRun = runs?.find((r) => r.id === selectedRunId);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Linting Run History</DialogTitle>
            <DialogDescription>View past linting runs and their results</DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !runs || runs.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No linting runs found.
            </div>
          ) : (
            <div className="flex gap-4 min-h-[300px] max-h-[60vh]">
              {/* Left: Run list */}
              <ScrollArea className="w-[220px] shrink-0 border-r pr-3 h-full">
                <div className="space-y-1.5">
                  {runs.map((run) => (
                    <RunRow
                      key={run.id}
                      run={run}
                      isSelected={run.id === selectedRunId}
                      onClick={() => setSelectedRunId(run.id)}
                    />
                  ))}
                </div>
              </ScrollArea>

              {/* Right: Selected run details */}
              <div className="flex-1 min-w-0">
                {!selectedRunId ? (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                    Select a run to view details
                  </div>
                ) : resultsLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : runResults ? (
                  <div className="space-y-3">
                    {selectedRun && (
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(selectedRun.started_at), "MMM d, yyyy HH:mm")} · {selectedRun.passed_rules}/{selectedRun.total_rules} passed
                      </div>
                    )}
                    <LintingChapterGrid
                      data={{
                        run: selectedRun || null,
                        results: runResults.results,
                        chapters: runResults.chapters,
                      }}
                      isLoading={false}
                      onChapterClick={(chapter) => {
                        setSelectedChapter(chapter);
                        setDetailsOpen(true);
                      }}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {selectedChapter && runResults && (
        <LintingDetailsDialog
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          chapter={selectedChapter}
          results={runResults.results}
        />
      )}
    </>
  );
}

function RunRow({ run, isSelected, onClick }: { run: LintingRun; isSelected: boolean; onClick: () => void }) {
  const passPercent = run.total_rules > 0 ? Math.round((run.passed_rules / run.total_rules) * 100) : 0;
  const allPassed = run.failed_rules === 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-2 rounded-md border transition-colors",
        isSelected ? "bg-accent border-primary/30" : "hover:bg-muted/50 border-transparent"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">
          {format(new Date(run.started_at), "MMM d, HH:mm")}
        </span>
        <div className="flex items-center gap-1">
          {allPassed ? (
            <CheckCircle className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <XCircle className="h-3.5 w-3.5 text-red-500" />
          )}
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        </div>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <Progress value={passPercent} className="h-1.5 flex-1" />
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
          {run.passed_rules}/{run.total_rules}
        </span>
      </div>
      <Badge
        variant="outline"
        className={cn(
          "mt-1 text-[10px] px-1.5 py-0",
          run.status === "completed" && "border-green-500/30 text-green-600",
          run.status === "running" && "border-blue-500/30 text-blue-600",
          run.status === "failed" && "border-red-500/30 text-red-600"
        )}
      >
        {run.status}
      </Badge>
    </button>
  );
}
