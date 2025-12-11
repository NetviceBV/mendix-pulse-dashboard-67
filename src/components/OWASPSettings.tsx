import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Edit2, Save, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { ManualVerificationURLs } from "./ManualVerificationURLs";

interface OWASPItem {
  id: string;
  owasp_id: string;
  title: string;
  description: string | null;
  expiration_months: number;
  is_active: boolean;
}

interface OWASPStep {
  id: string;
  owasp_item_id: string;
  step_name: string;
  step_description: string | null;
  edge_function_name: string;
  step_order: number;
  is_active: boolean;
}

interface EdgeFunction {
  id: string;
  function_name: string;
  display_name: string;
  description: string | null;
  category: string;
  is_active: boolean;
  is_owasp_compatible: boolean;
}

export const OWASPSettings = () => {
  const [items, setItems] = useState<OWASPItem[]>([]);
  const [steps, setSteps] = useState<Record<string, OWASPStep[]>>({});
  const [edgeFunctions, setEdgeFunctions] = useState<EdgeFunction[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingFunctions, setSyncingFunctions] = useState(false);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [editedData, setEditedData] = useState<Partial<OWASPItem>>({});
  const [editedStepData, setEditedStepData] = useState<Partial<OWASPStep>>({});
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [newStep, setNewStep] = useState({
    step_name: "",
    step_description: "",
    edge_function_name: "",
  });

  useEffect(() => {
    loadOWASPData();
  }, []);

  const loadOWASPData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check and initialize edge functions first
      const { data: existingFunctions } = await supabase
        .from("edge_functions")
        .select("*")
        .eq("is_active", true)
        .order("category, display_name");

      if (!existingFunctions || existingFunctions.length === 0) {
        await supabase.rpc("initialize_edge_functions", {
          target_user_id: user.id,
        });
        // Reload after initialization
        const { data: newFunctions } = await supabase
          .from("edge_functions")
          .select("*")
          .eq("is_active", true)
          .order("category, display_name");
        setEdgeFunctions(newFunctions || []);
      } else {
        setEdgeFunctions(existingFunctions);
      }

      // Check if user has OWASP items, if not initialize them
      const { data: existingItems } = await supabase
        .from("owasp_items")
        .select("*")
        .order("owasp_id");

      if (!existingItems || existingItems.length === 0) {
        await supabase.rpc("initialize_default_owasp_items", {
          target_user_id: user.id,
        });
        // Reload after initialization
        const { data: newItems } = await supabase
          .from("owasp_items")
          .select("*")
          .order("owasp_id");
        setItems(newItems || []);
      } else {
        setItems(existingItems);
      }

      // Load all steps
      const { data: allSteps } = await supabase
        .from("owasp_steps")
        .select("*")
        .order("step_order");

      if (allSteps) {
        const stepsByItem = allSteps.reduce((acc, step) => {
          if (!acc[step.owasp_item_id]) {
            acc[step.owasp_item_id] = [];
          }
          acc[step.owasp_item_id].push(step);
          return acc;
        }, {} as Record<string, OWASPStep[]>);
        setSteps(stepsByItem);
      }
    } catch (error) {
      console.error("Error loading OWASP data:", error);
      toast.error("Failed to load OWASP configuration");
    } finally {
      setLoading(false);
    }
  };

  const handleEditItem = (item: OWASPItem) => {
    setEditingItem(item.id);
    setEditedData(item);
  };

  const handleSaveItem = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from("owasp_items")
        .update(editedData)
        .eq("id", itemId);

      if (error) throw error;

      toast.success("OWASP item updated successfully");
      setEditingItem(null);
      loadOWASPData();
    } catch (error) {
      console.error("Error updating OWASP item:", error);
      toast.error("Failed to update OWASP item");
    }
  };

  const handleToggleActive = async (itemId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from("owasp_items")
        .update({ is_active: isActive })
        .eq("id", itemId);

      if (error) throw error;

      toast.success(`OWASP item ${isActive ? "activated" : "deactivated"}`);
      loadOWASPData();
    } catch (error) {
      console.error("Error toggling OWASP item:", error);
      toast.error("Failed to update OWASP item");
    }
  };

  const handleAddStep = async (owaspItemId: string) => {
    if (!newStep.step_name || !newStep.edge_function_name) {
      toast.error("Step name and edge function name are required");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const maxOrder = steps[owaspItemId]?.length || 0;

      const { error } = await supabase.from("owasp_steps").insert({
        user_id: user.id,
        owasp_item_id: owaspItemId,
        step_name: newStep.step_name,
        step_description: newStep.step_description || null,
        edge_function_name: newStep.edge_function_name,
        step_order: maxOrder,
      });

      if (error) throw error;

      toast.success("Step added successfully");
      setNewStep({ step_name: "", step_description: "", edge_function_name: "" });
      loadOWASPData();
    } catch (error) {
      console.error("Error adding step:", error);
      toast.error("Failed to add step");
    }
  };

  const handleEditStep = (step: OWASPStep) => {
    setEditingStep(step.id);
    setEditedStepData(step);
  };

  const handleSaveStep = async (stepId: string) => {
    try {
      const { error } = await supabase
        .from("owasp_steps")
        .update(editedStepData)
        .eq("id", stepId);

      if (error) throw error;

      toast.success("Step updated successfully");
      setEditingStep(null);
      loadOWASPData();
    } catch (error) {
      console.error("Error updating step:", error);
      toast.error("Failed to update step");
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    try {
      const { error } = await supabase
        .from("owasp_steps")
        .delete()
        .eq("id", stepId);

      if (error) throw error;

      toast.success("Step deleted successfully");
      loadOWASPData();
    } catch (error) {
      console.error("Error deleting step:", error);
      toast.error("Failed to delete step");
    }
  };

  const handleSyncEdgeFunctions = async () => {
    try {
      setSyncingFunctions(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.rpc("initialize_edge_functions", {
        target_user_id: user.id,
      });

      if (error) throw error;

      // Reload edge functions after sync
      const { data: functions } = await supabase
        .from("edge_functions")
        .select("*")
        .eq("is_active", true)
        .order("category, display_name");

      setEdgeFunctions(functions || []);
      toast.success("Edge functions synced successfully");
    } catch (error) {
      console.error("Error syncing edge functions:", error);
      toast.error("Failed to sync edge functions");
    } finally {
      setSyncingFunctions(false);
    }
  };

  const owaspCompatibleFunctions = edgeFunctions.filter(
    (func) => func.is_owasp_compatible
  );

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      mendix: "Mendix",
      security: "Security & Monitoring",
      automation: "Cloud Actions",
      notification: "Notifications",
      system: "System",
      general: "General",
    };
    return labels[category] || category;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold">OWASP Security Configuration</h2>
          <p className="text-muted-foreground">
            Configure OWASP Top 10 security checks and their validation steps
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleSyncEdgeFunctions}
          disabled={syncingFunctions}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${syncingFunctions ? 'animate-spin' : ''}`} />
          Sync Edge Functions
        </Button>
      </div>

      <div className="space-y-4">
        {items.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="outline">{item.owasp_id}</Badge>
                  {editingItem === item.id ? (
                    <Input
                      value={editedData.title || ""}
                      onChange={(e) =>
                        setEditedData({ ...editedData, title: e.target.value })
                      }
                      className="max-w-md"
                    />
                  ) : (
                    <CardTitle className="text-lg">{item.title}</CardTitle>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={item.is_active}
                    onCheckedChange={(checked) =>
                      handleToggleActive(item.id, checked)
                    }
                  />
                  {editingItem === item.id ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSaveItem(item.id)}
                      >
                        <Save className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingItem(null)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleEditItem(item)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
              {editingItem === item.id ? (
                <div className="space-y-2 mt-2">
                  <Textarea
                    value={editedData.description || ""}
                    onChange={(e) =>
                      setEditedData({ ...editedData, description: e.target.value })
                    }
                    placeholder="Description"
                  />
                  <div className="flex items-center gap-2">
                    <Label>Expiration (months):</Label>
                    <Input
                      type="number"
                      value={editedData.expiration_months || 12}
                      onChange={(e) =>
                        setEditedData({
                          ...editedData,
                          expiration_months: parseInt(e.target.value),
                        })
                      }
                      className="w-24"
                    />
                  </div>
                </div>
              ) : (
                <CardDescription>
                  {item.description} • Expires after {item.expiration_months} months
                </CardDescription>
              )}
            </CardHeader>

            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">Validation Steps</h4>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setSelectedItem(selectedItem === item.id ? null : item.id)
                    }
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Step
                  </Button>
                </div>

                {selectedItem === item.id && (
                  <Card className="bg-muted/50">
                    <CardContent className="pt-4 space-y-3">
                      <div>
                        <Label>Step Name</Label>
                        <Input
                          value={newStep.step_name}
                          onChange={(e) =>
                            setNewStep({ ...newStep, step_name: e.target.value })
                          }
                          placeholder="e.g., Check Public Endpoint Access"
                        />
                      </div>
                      <div>
                        <Label>Step Description</Label>
                        <Textarea
                          value={newStep.step_description}
                          onChange={(e) =>
                            setNewStep({
                              ...newStep,
                              step_description: e.target.value,
                            })
                          }
                          placeholder="Optional description"
                        />
                      </div>
                      <div>
                        <Label>Edge Function</Label>
                        <Select
                          value={newStep.edge_function_name}
                          onValueChange={(value) =>
                            setNewStep({ ...newStep, edge_function_name: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select an edge function" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(
                              owaspCompatibleFunctions.reduce((acc, func) => {
                                if (!acc[func.category]) acc[func.category] = [];
                                acc[func.category].push(func);
                                return acc;
                              }, {} as Record<string, EdgeFunction[]>)
                            ).map(([category, funcs]) => (
                              <div key={category}>
                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                  {getCategoryLabel(category)}
                                </div>
                                {funcs.map((func) => (
                                  <SelectItem key={func.id} value={func.function_name}>
                                    <div className="flex flex-col">
                                      <span>{func.display_name}</span>
                                      {func.description && (
                                        <span className="text-xs text-muted-foreground">
                                          {func.description}
                                        </span>
                                      )}
                                    </div>
                                  </SelectItem>
                                ))}
                              </div>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button onClick={() => handleAddStep(item.id)} className="w-full">
                        Add Step
                      </Button>
                    </CardContent>
                  </Card>
                )}

                <div className="space-y-2">
                  {steps[item.id]?.map((step, index) => (
                    <div key={step.id}>
                      {editingStep === step.id ? (
                        <Card className="p-3 space-y-3">
                          <div>
                            <Label>Step Name</Label>
                            <Input
                              value={editedStepData.step_name || ""}
                              onChange={(e) =>
                                setEditedStepData({
                                  ...editedStepData,
                                  step_name: e.target.value,
                                })
                              }
                            />
                          </div>
                          <div>
                            <Label>Step Description</Label>
                            <Textarea
                              value={editedStepData.step_description || ""}
                              onChange={(e) =>
                                setEditedStepData({
                                  ...editedStepData,
                                  step_description: e.target.value,
                                })
                              }
                            />
                          </div>
                          <div>
                            <Label>Edge Function</Label>
                            <Select
                              value={editedStepData.edge_function_name || ""}
                              onValueChange={(value) =>
                                setEditedStepData({
                                  ...editedStepData,
                                  edge_function_name: value,
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(
                                  owaspCompatibleFunctions.reduce((acc, func) => {
                                    if (!acc[func.category]) acc[func.category] = [];
                                    acc[func.category].push(func);
                                    return acc;
                                  }, {} as Record<string, EdgeFunction[]>)
                                ).map(([category, funcs]) => (
                                  <div key={category}>
                                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                      {getCategoryLabel(category)}
                                    </div>
                                    {funcs.map((func) => (
                                      <SelectItem key={func.id} value={func.function_name}>
                                        <div className="flex flex-col">
                                          <span>{func.display_name}</span>
                                          {func.description && (
                                            <span className="text-xs text-muted-foreground">
                                              {func.description}
                                            </span>
                                          )}
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </div>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleSaveStep(step.id)}
                              className="flex-1"
                            >
                              <Save className="w-4 h-4 mr-1" />
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingStep(null)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </Card>
                      ) : (
                        <div className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary">Step {index + 1}</Badge>
                              <span className="font-medium">{step.step_name}</span>
                            </div>
                            {step.step_description && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {step.step_description}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              Function: {step.edge_function_name}
                            </p>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEditStep(step)}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteStep(step.id)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {!steps[item.id]?.length && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No validation steps configured yet
                    </p>
                  )}
                </div>

                {/* Show Manual Verification URLs section for A02 */}
                {item.owasp_id === 'A02' && (
                  <ManualVerificationURLs owaspItemId={item.id} owaspId={item.owasp_id} />
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
