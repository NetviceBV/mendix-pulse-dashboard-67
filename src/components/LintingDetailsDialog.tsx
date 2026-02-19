import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle, XCircle, AlertTriangle, ChevronDown, Copy, Check, Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
      <DialogContent className="max-w-2xl max-h-[80vh]">
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
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState("");
  const hasDetails = rule.details && rule.status !== "pass";
  const allItems = hasDetails
    ? rule.details!.split("\n").filter(Boolean).map(item => item.replace(/^(\[.*?\]\s*)+/, ''))
    : [];
  const filteredItems = search
    ? allItems.filter((item) => item.toLowerCase().includes(search.toLowerCase()))
    : allItems;

  const statusIcon =
    rule.status === "pass" ? (
      <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
    ) : rule.status === "fail" ? (
      <XCircle className="h-4 w-4 text-red-500 shrink-0" />
    ) : (
      <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
    );

  const handleCopy = async () => {
    if (!rule.details) return;
    await navigator.clipboard.writeText(rule.details);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const header = (
    <div className="flex items-start gap-2">
      <div className="mt-0.5">{statusIcon}</div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
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
          {allItems.length > 0 && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
              {allItems.length} violation{allItems.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        {rule.rule_description && (
          <p className="text-xs text-muted-foreground">{rule.rule_description}</p>
        )}
      </div>
    </div>
  );

  if (!hasDetails) {
    return (
      <div
        className={cn(
          "p-3 rounded-md border",
          rule.status === "pass" && "bg-green-500/5 border-green-500/20",
          rule.status === "fail" && "bg-red-500/5 border-red-500/20",
          rule.status === "warning" && "bg-yellow-500/5 border-yellow-500/20"
        )}
      >
        {header}
      </div>
    );
  }

  return (
    <Collapsible>
      <div
        className={cn(
          "rounded-md border",
          rule.status === "fail" && "bg-red-500/5 border-red-500/20",
          rule.status === "warning" && "bg-yellow-500/5 border-yellow-500/20"
        )}
      >
        <CollapsibleTrigger className="w-full p-3 text-left">
          <div className="flex items-center justify-between">
            <div className="flex-1">{header}</div>
            <div className="flex items-center gap-1.5 ml-2 shrink-0">
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search violations..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-7 pl-7 text-xs"
                />
              </div>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={handleCopy}>
                {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
            {search && filteredItems.length !== allItems.length && (
              <span className="text-[10px] text-muted-foreground">
                Showing {filteredItems.length} of {allItems.length}
              </span>
            )}
            <div className="max-h-[400px] overflow-y-auto">
              <div className="space-y-0.5">
                {filteredItems.map((item, i) => (
                  <div
                    key={i}
                    className={cn(
                      "text-xs px-2 py-1.5 rounded",
                      i % 2 === 0 ? "bg-muted/40" : "bg-muted/20"
                    )}
                  >
                    {item}
                  </div>
                ))}
                {filteredItems.length === 0 && search && (
                  <p className="text-xs text-muted-foreground py-2 text-center">No matches found</p>
                )}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
