import { CheckCircle, XCircle, AlertTriangle, Loader2, FileCode } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import type { LintingData, LintingChapterSummary } from "@/hooks/useLintingQuery";

interface LintingChapterGridProps {
  data: LintingData;
  isLoading: boolean;
  onChapterClick: (chapter: string) => void;
}

const chapterIcons: Record<string, string> = {
  "Project Settings": "⚙️",
  "Domain Model": "🗂️",
  "Modules": "📦",
  "Pages": "📄",
  "Microflows": "🔀",
};

export function LintingChapterGrid({ data, isLoading, onChapterClick }: LintingChapterGridProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data.run || data.chapters.length === 0) {
    return (
      <div className="text-center py-6 text-sm text-muted-foreground">
        No linting results yet. Run linting checks to see results.
      </div>
    );
  }

  const totalRules = data.run.total_rules;
  const passedRules = data.run.passed_rules;
  const passPercentage = totalRules > 0 ? Math.round((passedRules / totalRules) * 100) : 0;

  return (
    <div className="space-y-3">
      {/* Chapter rows */}
      <div className="space-y-1.5">
        {data.chapters.map((ch) => (
          <ChapterRow key={ch.chapter} chapter={ch} onClick={() => onChapterClick(ch.chapter)} />
        ))}
      </div>

      {/* Summary footer */}
      <div className="pt-2 border-t space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {passedRules}/{totalRules} rules passed ({passPercentage}%)
          </span>
          {data.run.completed_at && (
            <span>Last run: {format(new Date(data.run.completed_at), "MMM d, HH:mm")}</span>
          )}
        </div>
        <Progress value={passPercentage} className="h-2" />
      </div>
    </div>
  );
}

function ChapterRow({ chapter, onClick }: { chapter: LintingChapterSummary; onClick: () => void }) {
  const allPassed = chapter.failed === 0 && chapter.warnings === 0;
  const hasFails = chapter.failed > 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 p-2 rounded-md border text-left transition-colors hover:bg-accent cursor-pointer",
        allPassed && "bg-green-500/5 border-green-500/20",
        hasFails && "bg-red-500/5 border-red-500/20",
        !allPassed && !hasFails && "bg-yellow-500/5 border-yellow-500/20"
      )}
    >
      <span className="text-base">{chapterIcons[chapter.chapter] || "📋"}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{chapter.chapter}</div>
      </div>
      <div className="flex items-center gap-2 text-xs shrink-0">
        <span className="text-muted-foreground">{chapter.passed}/{chapter.total}</span>
        {allPassed ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : hasFails ? (
          <XCircle className="h-4 w-4 text-red-500" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
        )}
      </div>
    </button>
  );
}
