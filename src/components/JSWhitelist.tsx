import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Code, Info } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

interface WhitelistEntry {
  id: string;
  script_pattern: string;
  description: string | null;
  created_at: string;
}

interface JSWhitelistProps {
  appId: string;
  appName?: string;
}

export function JSWhitelist({ appId, appName }: JSWhitelistProps) {
  const [entries, setEntries] = useState<WhitelistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPattern, setNewPattern] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    loadEntries();
  }, [appId]);

  const loadEntries = async () => {
    try {
      const { data, error } = await supabase
        .from("owasp_js_whitelist")
        .select("*")
        .eq("app_id", appId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setEntries(data || []);
    } catch (error) {
      console.error("Error loading whitelist entries:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddEntry = async () => {
    if (!newPattern.trim()) {
      toast.error("Script pattern is required");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from("owasp_js_whitelist").insert({
        user_id: user.id,
        app_id: appId,
        script_pattern: newPattern.trim(),
        description: newDescription.trim() || null,
      });

      if (error) throw error;

      toast.success("Whitelist entry added");
      setNewPattern("");
      setNewDescription("");
      setIsAdding(false);
      loadEntries();
    } catch (error: any) {
      if (error.code === "23505") {
        toast.error("This pattern already exists for this app");
      } else {
        console.error("Error adding whitelist entry:", error);
        toast.error("Failed to add whitelist entry");
      }
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    try {
      const { error } = await supabase
        .from("owasp_js_whitelist")
        .delete()
        .eq("id", entryId);

      if (error) throw error;

      toast.success("Whitelist entry removed");
      loadEntries();
    } catch (error) {
      console.error("Error deleting whitelist entry:", error);
      toast.error("Failed to remove whitelist entry");
    }
  };

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground py-2">
        Loading whitelist entries...
      </div>
    );
  }

  return (
    <div className="space-y-3 mt-4 pt-4 border-t">
      <div className="flex items-center justify-between">
        <div>
          <h5 className="font-medium text-sm flex items-center gap-2">
            <Code className="w-4 h-4" />
            JavaScript Whitelist
          </h5>
          <p className="text-xs text-muted-foreground">
            Whitelist non-Mendix JavaScript imports for {appName || appId}
          </p>
        </div>
        {!isAdding && (
          <Button size="sm" variant="outline" onClick={() => setIsAdding(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Add Pattern
          </Button>
        )}
      </div>

      {/* Info about vanilla patterns */}
      <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg text-xs">
        <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
        <div className="text-muted-foreground">
          <p className="font-medium mb-1">Automatically allowed (vanilla Mendix):</p>
          <p>mxclientsystem/*, mxui/*, dojo/*, dijit/*, widgets/*, lib/*, *.mendixcloud.com, relative paths (./*, ../*, /*)</p>
          <p className="mt-1">Use wildcards (*) in patterns: <code className="bg-background px-1 rounded">cdn.example.com/*</code></p>
        </div>
      </div>

      {isAdding && (
        <Card className="bg-muted/50">
          <CardContent className="pt-4 space-y-3">
            <div>
              <Label>Script Pattern</Label>
              <Input
                value={newPattern}
                onChange={(e) => setNewPattern(e.target.value)}
                placeholder="e.g., cdn.example.com/* or analytics.js"
              />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="e.g., Analytics library approved by security team"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAddEntry} className="flex-1">
                Add Pattern
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIsAdding(false);
                  setNewPattern("");
                  setNewDescription("");
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center gap-2 p-2 border rounded-lg bg-background"
          >
            <Badge variant="secondary" className="font-mono text-xs">
              {entry.script_pattern}
            </Badge>
            <div className="flex-1 min-w-0">
              {entry.description && (
                <p className="text-xs text-muted-foreground truncate">
                  {entry.description}
                </p>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDeleteEntry(entry.id)}
            >
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        ))}
        {entries.length === 0 && !isAdding && (
          <p className="text-sm text-muted-foreground text-center py-3">
            No whitelist entries. Non-Mendix JavaScript imports will be flagged.
          </p>
        )}
      </div>
    </div>
  );
}
