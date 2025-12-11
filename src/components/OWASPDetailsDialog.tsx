import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, XCircle, ExternalLink, Calendar, Clock, Link, CheckSquare } from "lucide-react";
import { format, differenceInMonths, addMonths } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ManualCheckUrl {
  id: string;
  url: string;
  description: string | null;
  display_order: number;
}

interface ManualVerification {
  id: string;
  verified_at: string;
  verified_by: string | null;
  notes: string | null;
}

export interface OWASPItem {
  id: string;
  title: string;
  fullTitle: string;
  status: 'pass' | 'fail' | 'warning' | 'unknown' | 'pending';
  checkDate: Date | null;
  details: string;
  requiresManualCheck: boolean;
  description: string;
  owaspUrl: string;
  expirationMonths: number;
  owaspItemId?: string;
  appId?: string;
  environmentName?: string;
  steps?: Array<{
    step_name: string;
    environment: string;
    status: string;
    details: string;
    checked_at: string;
  }>;
}

interface OWASPDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  owaspItem: OWASPItem | null;
  onVerificationComplete?: () => void;
}

const statusConfig = {
  pass: { icon: CheckCircle2, color: "text-green-500", bgColor: "bg-green-500/10", label: "Pass" },
  fail: { icon: XCircle, color: "text-red-500", bgColor: "bg-red-500/10", label: "Failed" },
  warning: { icon: AlertTriangle, color: "text-yellow-500", bgColor: "bg-yellow-500/10", label: "Warning" },
  pending: { icon: Clock, color: "text-blue-500", bgColor: "bg-blue-500/10", label: "Analysis in Progress" },
  unknown: { icon: AlertTriangle, color: "text-muted-foreground", bgColor: "bg-muted", label: "Not Checked" },
};

export function OWASPDetailsDialog({ open, onOpenChange, owaspItem, onVerificationComplete }: OWASPDetailsDialogProps) {
  const [manualUrls, setManualUrls] = useState<ManualCheckUrl[]>([]);
  const [manualVerification, setManualVerification] = useState<ManualVerification | null>(null);
  const [loadingUrls, setLoadingUrls] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (open && owaspItem?.owaspItemId && owaspItem.id === 'A02') {
      loadManualVerificationData();
    }
  }, [open, owaspItem?.owaspItemId, owaspItem?.appId, owaspItem?.environmentName]);

  const loadManualVerificationData = async () => {
    if (!owaspItem?.owaspItemId) return;

    setLoadingUrls(true);
    try {
      // Load URLs configured for this OWASP item
      const { data: urls, error: urlsError } = await supabase
        .from("owasp_manual_check_urls")
        .select("*")
        .eq("owasp_item_id", owaspItem.owaspItemId)
        .order("display_order", { ascending: true });

      if (urlsError) throw urlsError;
      setManualUrls(urls || []);

      // Load verification status for this app/environment
      if (owaspItem.appId && owaspItem.environmentName) {
        const { data: verification } = await supabase
          .from("owasp_manual_verifications")
          .select("*")
          .eq("owasp_item_id", owaspItem.owaspItemId)
          .eq("app_id", owaspItem.appId)
          .eq("environment_name", owaspItem.environmentName)
          .single();

        setManualVerification(verification || null);
      }
    } catch (error) {
      console.error("Error loading manual verification data:", error);
    } finally {
      setLoadingUrls(false);
    }
  };

  const handleMarkAsVerified = async () => {
    if (!owaspItem?.owaspItemId || !owaspItem.appId || !owaspItem.environmentName) {
      toast.error("Missing required context for verification");
      return;
    }

    setVerifying(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("You must be logged in to verify");
        return;
      }

      // Upsert verification record
      const { error } = await supabase
        .from("owasp_manual_verifications")
        .upsert({
          user_id: user.id,
          owasp_item_id: owaspItem.owaspItemId,
          app_id: owaspItem.appId,
          environment_name: owaspItem.environmentName,
          verified_at: new Date().toISOString(),
          verified_by: user.id,
        }, {
          onConflict: 'user_id,owasp_item_id,app_id,environment_name'
        });

      if (error) throw error;

      toast.success("URLs marked as verified successfully");
      await loadManualVerificationData();
      onVerificationComplete?.();
    } catch (error) {
      console.error("Error marking as verified:", error);
      toast.error("Failed to mark URLs as verified");
    } finally {
      setVerifying(false);
    }
  };

  if (!owaspItem) return null;

  const isExpired = owaspItem.checkDate 
    ? differenceInMonths(new Date(), owaspItem.checkDate) >= owaspItem.expirationMonths
    : true;
  
  const expirationDate = owaspItem.checkDate 
    ? addMonths(owaspItem.checkDate, owaspItem.expirationMonths)
    : null;

  const effectiveStatus = isExpired && owaspItem.status !== 'unknown' ? 'fail' : owaspItem.status;
  const StatusIcon = statusConfig[effectiveStatus].icon;

  // Check if this is A02 (Cryptographic Failures) - show manual verification section
  const showManualVerification = owaspItem.id === 'A02';

  // Calculate manual verification expiration
  const manualVerificationExpired = manualVerification
    ? new Date() > addMonths(new Date(manualVerification.verified_at), owaspItem.expirationMonths)
    : true;

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
                <Badge variant={effectiveStatus === 'pass' ? 'default' : effectiveStatus === 'fail' ? 'destructive' : 'secondary'}>
                  {isExpired && owaspItem.status !== 'unknown' ? 'Expired' : statusConfig[owaspItem.status].label}
                </Badge>
                {owaspItem.checkDate && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span>Last checked: {format(owaspItem.checkDate, 'MMM d, yyyy')}</span>
                  </div>
                )}
                {expirationDate && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>Recertify by: {format(expirationDate, 'MMM d, yyyy')}</span>
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
          {isExpired && owaspItem.status !== 'unknown' && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <h4 className="font-semibold text-destructive mb-2 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Check Expired - Recertification Required
              </h4>
              <p className="text-sm text-muted-foreground">
                This security check was last performed on {owaspItem.checkDate ? format(owaspItem.checkDate, 'MMM d, yyyy') : 'unknown'} and has exceeded 
                the {owaspItem.expirationMonths}-month recertification period. The check must be re-evaluated to ensure continued compliance.
              </p>
            </div>
          )}

          <div>
            <h4 className="font-semibold mb-2">Description</h4>
            <DialogDescription className="text-sm leading-relaxed">
              {owaspItem.description}
            </DialogDescription>
          </div>

          {!isExpired && owaspItem.status === 'fail' && owaspItem.details && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <h4 className="font-semibold text-destructive mb-2">Failure Details</h4>
              <p className="text-sm text-muted-foreground">{owaspItem.details}</p>
            </div>
          )}

          {!isExpired && owaspItem.status === 'warning' && owaspItem.details && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
              <h4 className="font-semibold text-yellow-600 mb-2">Warning Details</h4>
              <p className="text-sm text-muted-foreground">{owaspItem.details}</p>
            </div>
          )}

          {!isExpired && owaspItem.status === 'pass' && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
              <h4 className="font-semibold text-green-600 mb-2 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Security Check Passed
              </h4>
              <p className="text-sm text-muted-foreground">
                All automated checks for this OWASP item have passed successfully. Review the step details below for complete information.
              </p>
            </div>
          )}

          {/* Manual Verification Section for A02 */}
          {showManualVerification && (
            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Link className="h-5 w-5 text-primary" />
                <h4 className="font-semibold">Manual Verification URLs</h4>
              </div>

              {loadingUrls ? (
                <p className="text-sm text-muted-foreground">Loading verification URLs...</p>
              ) : manualUrls.length === 0 ? (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                  <p className="text-sm text-yellow-600">
                    No verification URLs configured. Go to Settings → OWASP Security → A02 to add URLs for manual verification.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {manualUrls.map((url) => (
                      <a
                        key={url.id}
                        href={url.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors group"
                      >
                        <ExternalLink className="h-4 w-4 text-primary group-hover:scale-110 transition-transform" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-primary truncate">{url.url}</p>
                          {url.description && (
                            <p className="text-xs text-muted-foreground">{url.description}</p>
                          )}
                        </div>
                      </a>
                    ))}
                  </div>

                  {/* Verification Status */}
                  <div className="pt-3 border-t">
                    {manualVerification ? (
                      <div className={`rounded-lg p-3 ${manualVerificationExpired ? 'bg-destructive/10' : 'bg-green-500/10'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          {manualVerificationExpired ? (
                            <XCircle className="h-4 w-4 text-destructive" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          )}
                          <span className={`text-sm font-medium ${manualVerificationExpired ? 'text-destructive' : 'text-green-600'}`}>
                            {manualVerificationExpired ? 'Verification Expired' : 'URLs Verified'}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Last verified: {format(new Date(manualVerification.verified_at), 'MMM d, yyyy HH:mm')}
                          {!manualVerificationExpired && (
                            <> • Valid until: {format(addMonths(new Date(manualVerification.verified_at), owaspItem.expirationMonths), 'MMM d, yyyy')}</>
                          )}
                        </p>
                      </div>
                    ) : (
                      <div className="bg-muted rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium text-muted-foreground">Never Verified</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          These URLs have never been verified for this environment.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Mark as Verified Button */}
                  <Button
                    onClick={handleMarkAsVerified}
                    disabled={verifying}
                    className="w-full"
                    variant={manualVerification && !manualVerificationExpired ? "outline" : "default"}
                  >
                    <CheckSquare className="h-4 w-4 mr-2" />
                    {verifying ? "Marking as Verified..." : "Mark URLs as Verified"}
                  </Button>
                </>
              )}
            </div>
          )}

          {owaspItem.steps && owaspItem.steps.length > 0 && (
            <div>
              <h4 className="font-semibold mb-3">Step Results by Environment</h4>
              <div className="space-y-2">
                {owaspItem.steps.map((step, index) => {
                  const stepStatusConfig = statusConfig[step.status as keyof typeof statusConfig] || statusConfig.unknown;
                  const StepIcon = stepStatusConfig.icon;
                  
                  return (
                    <div key={index} className="border rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <div className={`p-1.5 rounded ${stepStatusConfig.bgColor} mt-0.5`}>
                          <StepIcon className={`h-4 w-4 ${stepStatusConfig.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">{step.step_name}</span>
                            <Badge variant="outline" className="text-xs">
                              {step.environment}
                            </Badge>
                          </div>
                          {step.details && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {step.details}
                            </p>
                          )}
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            <Calendar className="h-3 w-3" />
                            <span>{format(new Date(step.checked_at), 'MMM d, yyyy HH:mm')}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
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
