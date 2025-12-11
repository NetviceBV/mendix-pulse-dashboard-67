import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, ExternalLink, GripVertical } from "lucide-react";
import { toast } from "sonner";

interface ManualCheckUrl {
  id: string;
  url: string;
  description: string | null;
  display_order: number;
}

interface ManualVerificationURLsProps {
  owaspItemId: string;
  owaspId: string;
}

export function ManualVerificationURLs({ owaspItemId, owaspId }: ManualVerificationURLsProps) {
  const [urls, setUrls] = useState<ManualCheckUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUrl, setNewUrl] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    loadUrls();
  }, [owaspItemId]);

  const loadUrls = async () => {
    try {
      const { data, error } = await supabase
        .from("owasp_manual_check_urls")
        .select("*")
        .eq("owasp_item_id", owaspItemId)
        .order("display_order", { ascending: true });

      if (error) throw error;
      setUrls(data || []);
    } catch (error) {
      console.error("Error loading URLs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUrl = async () => {
    if (!newUrl.trim()) {
      toast.error("URL is required");
      return;
    }

    // Validate URL format
    try {
      new URL(newUrl);
    } catch {
      toast.error("Please enter a valid URL");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from("owasp_manual_check_urls").insert({
        user_id: user.id,
        owasp_item_id: owaspItemId,
        url: newUrl.trim(),
        description: newDescription.trim() || null,
        display_order: urls.length,
      });

      if (error) throw error;

      toast.success("URL added successfully");
      setNewUrl("");
      setNewDescription("");
      setIsAdding(false);
      loadUrls();
    } catch (error: any) {
      if (error.code === "23505") {
        toast.error("This URL already exists for this OWASP item");
      } else {
        console.error("Error adding URL:", error);
        toast.error("Failed to add URL");
      }
    }
  };

  const handleDeleteUrl = async (urlId: string) => {
    try {
      const { error } = await supabase
        .from("owasp_manual_check_urls")
        .delete()
        .eq("id", urlId);

      if (error) throw error;

      toast.success("URL removed");
      loadUrls();
    } catch (error) {
      console.error("Error deleting URL:", error);
      toast.error("Failed to remove URL");
    }
  };

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground py-2">
        Loading verification URLs...
      </div>
    );
  }

  return (
    <div className="space-y-3 mt-4 pt-4 border-t">
      <div className="flex items-center justify-between">
        <div>
          <h5 className="font-medium text-sm">Manual Verification URLs</h5>
          <p className="text-xs text-muted-foreground">
            Configure URLs to manually verify for {owaspId} compliance
          </p>
        </div>
        {!isAdding && (
          <Button size="sm" variant="outline" onClick={() => setIsAdding(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Add URL
          </Button>
        )}
      </div>

      {isAdding && (
        <Card className="bg-muted/50">
          <CardContent className="pt-4 space-y-3">
            <div>
              <Label>URL</Label>
              <Input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://www.ssllabs.com/ssltest/"
              />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="e.g., SSL Certificate Check"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAddUrl} className="flex-1">
                Add URL
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIsAdding(false);
                  setNewUrl("");
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
        {urls.map((url) => (
          <div
            key={url.id}
            className="flex items-center gap-2 p-2 border rounded-lg bg-background"
          >
            <GripVertical className="w-4 h-4 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <a
                href={url.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1 truncate"
              >
                {url.url}
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
              </a>
              {url.description && (
                <p className="text-xs text-muted-foreground truncate">
                  {url.description}
                </p>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDeleteUrl(url.id)}
            >
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        ))}
        {urls.length === 0 && !isAdding && (
          <p className="text-sm text-muted-foreground text-center py-3">
            No verification URLs configured. Add URLs to enable manual verification checks.
          </p>
        )}
      </div>
    </div>
  );
}
