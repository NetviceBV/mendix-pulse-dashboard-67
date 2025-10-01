import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, XCircle, ExternalLink, Calendar } from "lucide-react";
import { format } from "date-fns";

export interface OWASPItem {
  id: string;
  title: string;
  fullTitle: string;
  status: 'pass' | 'fail' | 'warning' | 'unknown';
  checkDate: Date | null;
  details: string;
  requiresManualCheck: boolean;
  description: string;
  owaspUrl: string;
}

interface OWASPDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  owaspItem: OWASPItem | null;
}

const statusConfig = {
  pass: { icon: CheckCircle2, color: "text-green-500", bgColor: "bg-green-500/10", label: "Pass" },
  fail: { icon: XCircle, color: "text-red-500", bgColor: "bg-red-500/10", label: "Failed" },
  warning: { icon: AlertTriangle, color: "text-yellow-500", bgColor: "bg-yellow-500/10", label: "Warning" },
  unknown: { icon: AlertTriangle, color: "text-muted-foreground", bgColor: "bg-muted", label: "Not Checked" },
};

export function OWASPDetailsDialog({ open, onOpenChange, owaspItem }: OWASPDetailsDialogProps) {
  if (!owaspItem) return null;

  const StatusIcon = statusConfig[owaspItem.status].icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${statusConfig[owaspItem.status].bgColor}`}>
              <StatusIcon className={`h-6 w-6 ${statusConfig[owaspItem.status].color}`} />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-xl mb-1">
                {owaspItem.id}: {owaspItem.fullTitle}
              </DialogTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={owaspItem.status === 'pass' ? 'default' : owaspItem.status === 'fail' ? 'destructive' : 'secondary'}>
                  {statusConfig[owaspItem.status].label}
                </Badge>
                {owaspItem.checkDate && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span>Last checked: {format(owaspItem.checkDate, 'MMM d, yyyy')}</span>
                  </div>
                )}
                {owaspItem.requiresManualCheck && (
                  <Badge variant="outline" className="text-xs">Manual Check Required</Badge>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div>
            <h4 className="font-semibold mb-2">Description</h4>
            <DialogDescription className="text-sm leading-relaxed">
              {owaspItem.description}
            </DialogDescription>
          </div>

          {owaspItem.status === 'fail' && owaspItem.details && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <h4 className="font-semibold text-destructive mb-2">Failure Details</h4>
              <p className="text-sm text-muted-foreground">{owaspItem.details}</p>
            </div>
          )}

          {owaspItem.status === 'warning' && owaspItem.details && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
              <h4 className="font-semibold text-yellow-600 mb-2">Warning Details</h4>
              <p className="text-sm text-muted-foreground">{owaspItem.details}</p>
            </div>
          )}

          <div className="pt-4 border-t">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.open(owaspItem.owaspUrl, '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View OWASP Documentation
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
