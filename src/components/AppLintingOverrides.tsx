import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, RotateCcw, Settings2 } from "lucide-react";
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

interface Override {
  id: string;
  policy_id: string;
  is_enabled: boolean;
}

interface AppLintingOverridesProps {
  appId: string;
  appName?: string;
}

const severityColor = (severity: string | null) => {
  switch (severity?.toLowerCase()) {
    case "error": return "destructive" as const;
    case "warning": return "secondary" as const;
    default: return "outline" as const;
  }
};

export function AppLintingOverrides({ appId, appName }: AppLintingOverridesProps) {
  const [policies, setPolicies] = useState<LintingPolicy[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [appId]);

  const loadData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const [policiesRes, overridesRes] = await Promise.all([
      supabase
        .from("linting_policies")
        .select("*")
        .eq("user_id", user.id)
        .order("directory")
        .order("rule_id"),
      supabase
        .from("linting_policy_overrides")
        .select("id, policy_id, is_enabled")
        .eq("user_id", user.id)
        .eq("app_id", appId),
    ]);

    if (policiesRes.error) toast.error("Failed to load policies");
    if (overridesRes.error) toast.error("Failed to load overrides");

    setPolicies((policiesRes.data || []) as LintingPolicy[]);
    setOverrides((overridesRes.data || []) as Override[]);
    setLoading(false);
  };

  const overrideMap = useMemo(() => {
    const map = new Map<string, Override>();
    overrides.forEach(o => map.set(o.policy_id, o));
    return map;
  }, [overrides]);

  const overrideCount = overrides.length;

  const getEffective = (policy: LintingPolicy): boolean => {
    const override = overrideMap.get(policy.id);
    return override ? override.is_enabled : policy.is_enabled;
  };

  const isOverridden = (policy: LintingPolicy): boolean => {
    return overrideMap.has(policy.id);
  };

  const toggleRule = async (policy: LintingPolicy) => {
    if (!userId) return;
    const existing = overrideMap.get(policy.id);
    const currentEffective = getEffective(policy);
    const newValue = !currentEffective;

    if (existing) {
      // If toggling back to global default, delete the override
      if (newValue === policy.is_enabled) {
        // Optimistic
        setOverrides(prev => prev.filter(o => o.id !== existing.id));
        const { error } = await supabase
          .from("linting_policy_overrides")
          .delete()
          .eq("id", existing.id);
        if (error) {
          toast.error("Failed to remove override");
          loadData();
        }
      } else {
        // Update existing override
        setOverrides(prev => prev.map(o => o.id === existing.id ? { ...o, is_enabled: newValue } : o));
        const { error } = await supabase
          .from("linting_policy_overrides")
          .update({ is_enabled: newValue })
          .eq("id", existing.id);
        if (error) {
          toast.error("Failed to update override");
          loadData();
        }
      }
    } else {
      // Create new override (only if different from global)
      if (newValue !== policy.is_enabled) {
        const tempId = crypto.randomUUID();
        setOverrides(prev => [...prev, { id: tempId, policy_id: policy.id, is_enabled: newValue }]);
        const { data, error } = await supabase
          .from("linting_policy_overrides")
          .insert({ user_id: userId, app_id: appId, policy_id: policy.id, is_enabled: newValue })
          .select("id")
          .single();
        if (error) {
          toast.error("Failed to create override");
          loadData();
        } else {
          setOverrides(prev => prev.map(o => o.id === tempId ? { ...o, id: data.id } : o));
        }
      }
    }
  };

  const resetRule = async (policy: LintingPolicy) => {
    const existing = overrideMap.get(policy.id);
    if (!existing) return;
    setOverrides(prev => prev.filter(o => o.id !== existing.id));
    const { error } = await supabase
      .from("linting_policy_overrides")
      .delete()
      .eq("id", existing.id);
    if (error) {
      toast.error("Failed to reset rule");
      loadData();
    }
  };

  const resetAll = async () => {
    if (!userId || overrides.length === 0) return;
    const ids = overrides.map(o => o.id);
    setOverrides([]);
    const { error } = await supabase
      .from("linting_policy_overrides")
      .delete()
      .in("id", ids);
    if (error) {
      toast.error("Failed to reset overrides");
      loadData();
    } else {
      toast.success("All overrides reset to global defaults");
    }
  };

  // Group by category
  const grouped = useMemo(() => {
    return policies.reduce<Record<string, LintingPolicy[]>>((acc, p) => {
      (acc[p.category] = acc[p.category] || []).push(p);
      return acc;
    }, {});
  }, [policies]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (policies.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-muted-foreground text-sm">
          No global linting rules configured. Go to Settings → Linting Rules to fetch them first.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="w-4 h-4" />
              Linting Overrides {appName && `– ${appName}`}
            </CardTitle>
            {overrideCount > 0 && (
              <Button variant="ghost" size="sm" onClick={resetAll} className="gap-1 text-xs">
                <RotateCcw className="w-3 h-3" />
                Reset All ({overrideCount})
              </Button>
            )}
          </div>
          <CardDescription>
            Toggle rules to override global defaults for this app. Rules without overrides inherit the global setting.
          </CardDescription>
        </CardHeader>
      </Card>

      {Object.entries(grouped)
        .sort(([, a], [, b]) => {
          const aDir = a[0]?.directory || "";
          const bDir = b[0]?.directory || "";
          return aDir.localeCompare(bDir);
        })
        .map(([category, rules]) => (
          <Card key={category}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm capitalize">
                {category.replace(/_/g, " ")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {rules.map(rule => {
                const overridden = isOverridden(rule);
                const effective = getEffective(rule);
                return (
                  <div
                    key={rule.id}
                    className={`flex items-center justify-between py-2 px-3 rounded-md transition-colors ${
                      overridden ? "bg-accent/50 border border-accent" : "hover:bg-muted/50"
                    }`}
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
                        {overridden && (
                          <Badge variant="outline" className="text-[10px] border-primary/50 text-primary">
                            overridden
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {overridden && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => resetRule(rule)}
                          className="h-6 px-2 text-xs text-muted-foreground"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </Button>
                      )}
                      <Switch
                        checked={effective}
                        onCheckedChange={() => toggleRule(rule)}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
    </div>
  );
}
