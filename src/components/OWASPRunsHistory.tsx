import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Calendar, ChevronDown, ChevronUp, Shield, CheckCircle2, XCircle, AlertTriangle, Clock } from "lucide-react";
import { format } from "date-fns";

interface OWASPRun {
  id: string;
  app_id: string;
  environment_name: string;
  run_started_at: string;
  run_completed_at: string | null;
  overall_status: string;
  total_checks: number;
  passed_checks: number;
  failed_checks: number;
  warning_checks: number;
  app_name?: string;
}

interface CheckResult {
  id: string;
  status: string;
  details: string;
  execution_time_ms: number;
  checked_at: string;
  owasp_steps: {
    step_name: string;
    owasp_items: {
      title: string;
      owasp_id: string;
    };
  };
}

export function OWASPRunsHistory() {
  const [runs, setRuns] = useState<OWASPRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [runResults, setRunResults] = useState<Record<string, CheckResult[]>>({});

  useEffect(() => {
    fetchRuns();
  }, []);

  const fetchRuns = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch runs
      const { data: runsData, error: runsError } = await supabase
        .from('owasp_check_runs')
        .select('*')
        .eq('user_id', user.id)
        .order('run_started_at', { ascending: false });

      if (runsError) throw runsError;

      // Fetch app names for each run
      const appIds = [...new Set(runsData?.map(r => r.app_id) || [])];
      const { data: appsData, error: appsError } = await supabase
        .from('mendix_apps')
        .select('project_id, app_name')
        .in('project_id', appIds);

      if (appsError) throw appsError;

      // Create a map of app_id to app_name
      const appNameMap = new Map(appsData?.map(app => [app.project_id, app.app_name]) || []);

      // Merge the data
      const runsWithAppName = (runsData || []).map(run => ({
        ...run,
        app_name: appNameMap.get(run.app_id) || 'Unknown App'
      }));

      setRuns(runsWithAppName);
    } catch (error) {
      console.error('Error fetching OWASP runs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRunResults = async (runId: string) => {
    if (runResults[runId]) return; // Already loaded

    try {
      const { data, error } = await supabase
        .from('owasp_check_results')
        .select(`
          id,
          status,
          details,
          execution_time_ms,
          checked_at,
          owasp_steps!inner(
            step_name,
            owasp_items!inner(
              title,
              owasp_id
            )
          )
        `)
        .eq('run_id', runId)
        .order('checked_at', { ascending: true });

      if (error) throw error;
      setRunResults(prev => ({ ...prev, [runId]: data || [] }));
    } catch (error) {
      console.error('Error fetching run results:', error);
    }
  };

  const toggleRun = async (runId: string) => {
    if (expandedRun === runId) {
      setExpandedRun(null);
    } else {
      setExpandedRun(runId);
      await fetchRunResults(runId);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass':
        return <CheckCircle2 className="w-4 h-4 text-success" />;
      case 'fail':
        return <XCircle className="w-4 h-4 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-warning" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pass: "default",
      fail: "destructive",
      warning: "secondary",
      running: "outline",
    };

    return (
      <Badge variant={variants[status] || "outline"} className="capitalize">
        {status}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5" />
          OWASP Check History
        </CardTitle>
        <CardDescription>
          View all historical OWASP Top 10 security check runs
        </CardDescription>
      </CardHeader>
      <CardContent>
        {runs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No OWASP check runs found</p>
            <p className="text-sm">Run your first OWASP check from the dashboard</p>
          </div>
        ) : (
          <div className="space-y-3">
            {runs.map((run) => (
              <Collapsible
                key={run.id}
                open={expandedRun === run.id}
                onOpenChange={() => toggleRun(run.id)}
              >
                <Card className="overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      className="w-full p-4 hover:bg-accent flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(run.overall_status)}
                          {getStatusBadge(run.overall_status)}
                        </div>
                        <div className="text-left flex-1">
                          <div className="font-medium text-sm">
                            {run.app_name}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(run.run_started_at), "PPpp")}
                          </div>
                        </div>
                        <div className="flex gap-4 text-xs">
                          <div className="text-center">
                            <div className="font-semibold text-success">{run.passed_checks}</div>
                            <div className="text-muted-foreground">Passed</div>
                          </div>
                          <div className="text-center">
                            <div className="font-semibold text-destructive">{run.failed_checks}</div>
                            <div className="text-muted-foreground">Failed</div>
                          </div>
                        </div>
                      </div>
                      {expandedRun === run.id ? (
                        <ChevronUp className="w-4 h-4 ml-2" />
                      ) : (
                        <ChevronDown className="w-4 h-4 ml-2" />
                      )}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t p-4 space-y-2">
                      {runResults[run.id] ? (
                        runResults[run.id].map((result) => (
                          <div
                            key={result.id}
                            className="flex items-start gap-3 p-3 bg-accent/50 rounded-md"
                          >
                            {getStatusIcon(result.status)}
                            <div className="flex-1">
                              <div className="font-medium text-sm">
                                {result.owasp_steps.owasp_items.owasp_id}: {result.owasp_steps.owasp_items.title}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {result.owasp_steps.step_name}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {result.details}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                Execution time: {result.execution_time_ms}ms
                              </div>
                            </div>
                            {getStatusBadge(result.status)}
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-4">
                          <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
