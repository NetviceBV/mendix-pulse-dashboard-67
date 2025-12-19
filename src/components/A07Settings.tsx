import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Save, Plus, X, Info } from "lucide-react";
import { toast } from "sonner";

interface A07SettingsData {
  id?: string;
  minimum_length: number;
  require_digit: boolean;
  require_symbol: boolean;
  require_mixed_case: boolean;
  sso_patterns: string[];
}

const DEFAULT_SETTINGS: A07SettingsData = {
  minimum_length: 8,
  require_digit: true,
  require_symbol: true,
  require_mixed_case: true,
  sso_patterns: ["saml20", "oidc", "keycloak", "azuread", "okta"],
};

export const A07Settings = () => {
  const [settings, setSettings] = useState<A07SettingsData>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newPattern, setNewPattern] = useState("");

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load user's default settings (app_id is null)
      const { data, error } = await supabase
        .from("owasp_a07_settings")
        .select("*")
        .eq("user_id", user.id)
        .is("app_id", null)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings({
          id: data.id,
          minimum_length: data.minimum_length ?? DEFAULT_SETTINGS.minimum_length,
          require_digit: data.require_digit ?? DEFAULT_SETTINGS.require_digit,
          require_symbol: data.require_symbol ?? DEFAULT_SETTINGS.require_symbol,
          require_mixed_case: data.require_mixed_case ?? DEFAULT_SETTINGS.require_mixed_case,
          sso_patterns: (data.sso_patterns as string[]) ?? DEFAULT_SETTINGS.sso_patterns,
        });
      }
    } catch (error) {
      console.error("Error loading A07 settings:", error);
      toast.error("Failed to load A07 settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const settingsData = {
        user_id: user.id,
        app_id: null,
        minimum_length: settings.minimum_length,
        require_digit: settings.require_digit,
        require_symbol: settings.require_symbol,
        require_mixed_case: settings.require_mixed_case,
        sso_patterns: settings.sso_patterns,
      };

      if (settings.id) {
        // Update existing
        const { error } = await supabase
          .from("owasp_a07_settings")
          .update(settingsData)
          .eq("id", settings.id);
        
        if (error) throw error;
      } else {
        // Insert new
        const { data, error } = await supabase
          .from("owasp_a07_settings")
          .insert(settingsData)
          .select()
          .single();

        if (error) throw error;
        setSettings(prev => ({ ...prev, id: data.id }));
      }

      toast.success("A07 default settings saved");
    } catch (error) {
      console.error("Error saving A07 settings:", error);
      toast.error("Failed to save A07 settings");
    } finally {
      setSaving(false);
    }
  };

  const addPattern = () => {
    if (newPattern.trim() && !settings.sso_patterns.includes(newPattern.trim().toLowerCase())) {
      setSettings(prev => ({
        ...prev,
        sso_patterns: [...prev.sso_patterns, newPattern.trim().toLowerCase()],
      }));
      setNewPattern("");
    }
  };

  const removePattern = (pattern: string) => {
    setSettings(prev => ({
      ...prev,
      sso_patterns: prev.sso_patterns.filter(p => p !== pattern),
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Info className="w-4 h-4" />
          A07 Default Configuration
        </CardTitle>
        <CardDescription>
          Configure default password policy requirements and SSO module patterns. These defaults apply to all apps unless overridden per-app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Password Policy Settings */}
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Password Policy Requirements</h4>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="minLength">Minimum Length</Label>
              <Input
                id="minLength"
                type="number"
                min={1}
                max={128}
                value={settings.minimum_length}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  minimum_length: parseInt(e.target.value) || 8,
                }))}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="requireDigit"
                checked={settings.require_digit}
                onCheckedChange={(checked) => setSettings(prev => ({
                  ...prev,
                  require_digit: !!checked,
                }))}
              />
              <Label htmlFor="requireDigit" className="text-sm">Require digit</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="requireSymbol"
                checked={settings.require_symbol}
                onCheckedChange={(checked) => setSettings(prev => ({
                  ...prev,
                  require_symbol: !!checked,
                }))}
              />
              <Label htmlFor="requireSymbol" className="text-sm">Require symbol</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="requireMixedCase"
                checked={settings.require_mixed_case}
                onCheckedChange={(checked) => setSettings(prev => ({
                  ...prev,
                  require_mixed_case: !!checked,
                }))}
              />
              <Label htmlFor="requireMixedCase" className="text-sm">Require mixed case</Label>
            </div>
          </div>
        </div>

        {/* SSO Patterns */}
        <div className="space-y-3">
          <h4 className="font-medium text-sm">SSO Module Patterns</h4>
          <p className="text-xs text-muted-foreground">
            Module names matching these patterns (case-insensitive) are recognized as SSO modules. If an SSO module is detected, the password policy check is skipped.
          </p>
          
          <div className="flex flex-wrap gap-2">
            {settings.sso_patterns.map((pattern) => (
              <Badge key={pattern} variant="secondary" className="flex items-center gap-1">
                {pattern}
                <button
                  onClick={() => removePattern(pattern)}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Add pattern (e.g., saml20)"
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPattern()}
              className="flex-1"
            />
            <Button variant="outline" size="sm" onClick={addPattern}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Saving..." : "Save Default Settings"}
        </Button>
      </CardContent>
    </Card>
  );
};
