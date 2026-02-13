import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, CheckSquare, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface LintingPolicy {
  id: string;
  rule_id: string;
  category: string;
  title: string;
  description: string | null;
  severity: string | null;
  is_enabled: boolean;
  directory: string | null;
}

const severityColor = (severity: string | null) => {
  switch (severity?.toLowerCase()) {
    case "error": return "destructive";
    case "warning": return "secondary";
    default: return "outline";
  }
};

export default function LintingSettings() {
  const [policies, setPolicies] = useState<LintingPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    loadPolicies();
  }, []);

  const loadPolicies = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('linting_policies')
      .select('*')
      .eq('user_id', user.id)
      .order('category')
      .order('rule_id');

    if (error) {
      toast.error("Failed to load policies");
    } else {
      setPolicies((data || []) as LintingPolicy[]);
    }
    setLoading(false);
  };

  const fetchFromApi = async () => {
    setFetching(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Not authenticated"); return; }

      const { data, error } = await supabase.functions.invoke('fetch-linting-policies', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw error;
      if (data?.policies) {
        setPolicies(data.policies as LintingPolicy[]);
        toast.success(`Fetched ${data.fetched} rules from Analyzer API`);
      }
    } catch (err: unknown) {
      toast.error(`Failed to fetch rules: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setFetching(false);
    }
  };

  const toggleRule = async (policy: LintingPolicy) => {
    const newValue = !policy.is_enabled;
    // Optimistic update
    setPolicies(prev => prev.map(p => p.id === policy.id ? { ...p, is_enabled: newValue } : p));

    const { error } = await supabase
      .from('linting_policies')
      .update({ is_enabled: newValue })
      .eq('id', policy.id);

    if (error) {
      toast.error("Failed to update rule");
      setPolicies(prev => prev.map(p => p.id === policy.id ? { ...p, is_enabled: !newValue } : p));
    }
  };

  const toggleCategory = async (category: string, enable: boolean) => {
    const categoryPolicies = policies.filter(p => p.category === category);
    const ids = categoryPolicies.map(p => p.id);

    // Optimistic update
    setPolicies(prev => prev.map(p => ids.includes(p.id) ? { ...p, is_enabled: enable } : p));

    const { error } = await supabase
      .from('linting_policies')
      .update({ is_enabled: enable })
      .in('id', ids);

    if (error) {
      toast.error("Failed to update rules");
      loadPolicies();
    }
  };

  // Group by category
  const grouped = policies.reduce<Record<string, LintingPolicy[]>>((acc, p) => {
    (acc[p.category] = acc[p.category] || []).push(p);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Linting Rules</CardTitle>
          <CardDescription>
            Fetch available rules from the Mendix Analyzer API and configure which rules to use globally when running linting checks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={fetchFromApi} disabled={fetching} className="gap-2">
            {fetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {fetching ? "Fetching..." : "Fetch Available Rules"}
          </Button>
        </CardContent>
      </Card>

      {policies.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No rules loaded yet. Click "Fetch Available Rules" to retrieve them from the Analyzer API.
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).sort(([, aRules], [, bRules]) => {
          const aDir = aRules[0]?.directory || '';
          const bDir = bRules[0]?.directory || '';
          return aDir.localeCompare(bDir);
        }).map(([category, rules]) => {
          const allEnabled = rules.every(r => r.is_enabled);
          const noneEnabled = rules.every(r => !r.is_enabled);

          return (
            <Card key={category}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base capitalize">
                    {category.replace(/_/g, ' ')}
                    <span className="text-muted-foreground font-normal ml-2 text-sm">
                      ({rules.filter(r => r.is_enabled).length}/{rules.length} enabled)
                    </span>
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleCategory(category, true)}
                      disabled={allEnabled}
                      className="gap-1 text-xs"
                    >
                      <CheckSquare className="w-3 h-3" /> All
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleCategory(category, false)}
                      disabled={noneEnabled}
                      className="gap-1 text-xs"
                    >
                      <Square className="w-3 h-3" /> None
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {rules.map(rule => (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="text-xs text-muted-foreground">{rule.rule_id}</code>
                        <span className="text-sm font-medium truncate">{rule.title}</span>
                        {rule.severity && (
                          <Badge variant={severityColor(rule.severity)} className="text-xs">
                            {rule.severity}
                          </Badge>
                        )}
                      </div>
                      {rule.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{rule.description}</p>
                      )}
                    </div>
                    <Switch
                      checked={rule.is_enabled}
                      onCheckedChange={() => toggleRule(rule)}
                      className="ml-4"
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
