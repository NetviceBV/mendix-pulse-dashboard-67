import { useState } from "react";
import { Search, ChevronDown, ChevronRight, Code, Package } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

export interface MicroflowData {
  name: string;
  module: string | null;
  qualifiedName: string;
}

export interface MicroflowsByModule {
  [moduleName: string]: MicroflowData[];
}

export interface MicroflowsResponse {
  appId: string;
  availableModules: string[];
  microflows: MicroflowData[];
  microflowsByModule: MicroflowsByModule;
  count: number;
  totalCount: number;
}

interface MicroflowsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  microflowsData: MicroflowsResponse | null;
  loading: boolean;
  appName: string;
}

export function MicroflowsDialog({ 
  open, 
  onOpenChange, 
  microflowsData, 
  loading, 
  appName 
}: MicroflowsDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});

  const toggleModule = (moduleName: string) => {
    setExpandedModules(prev => ({
      ...prev,
      [moduleName]: !prev[moduleName]
    }));
  };

  const filteredMicroflowsByModule = microflowsData?.microflowsByModule 
    ? Object.entries(microflowsData.microflowsByModule).reduce((acc, [moduleName, microflows]) => {
        const filteredMicroflows = microflows.filter(mf => 
          mf.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          mf.qualifiedName.toLowerCase().includes(searchTerm.toLowerCase())
        );
        if (filteredMicroflows.length > 0) {
          acc[moduleName] = filteredMicroflows;
        }
        return acc;
      }, {} as MicroflowsByModule)
    : {};

  const totalFilteredMicroflows = Object.values(filteredMicroflowsByModule)
    .reduce((sum, microflows) => sum + microflows.length, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            Microflows - {appName}
          </DialogTitle>
          <DialogDescription>
            {loading 
              ? "Loading microflows from Mendix application..."
              : microflowsData 
                ? `Found ${microflowsData.count} microflows across ${Object.keys(microflowsData.microflowsByModule).length} modules`
                : "No microflows data available"
            }
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 space-y-4">
            <Skeleton className="h-10 w-full" />
            {[...Array(5)].map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-6 w-48" />
                <div className="pl-4 space-y-1">
                  {[...Array(3)].map((_, j) => (
                    <Skeleton key={j} className="h-4 w-64" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : microflowsData ? (
          <div className="flex-1 flex flex-col gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search microflows..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {searchTerm && (
              <div className="text-sm text-muted-foreground">
                Showing {totalFilteredMicroflows} of {microflowsData.count} microflows
              </div>
            )}

            <ScrollArea className="flex-1">
              <div className="space-y-2">
                {Object.entries(filteredMicroflowsByModule).map(([moduleName, microflows]) => (
                  <Collapsible
                    key={moduleName}
                    open={expandedModules[moduleName] ?? true}
                    onOpenChange={() => toggleModule(moduleName)}
                  >
                    <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-primary" />
                        <span className="font-semibold">{moduleName}</span>
                        <Badge variant="secondary" className="text-xs">
                          {microflows.length}
                        </Badge>
                      </div>
                      {expandedModules[moduleName] ?? true ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </CollapsibleTrigger>

                    <CollapsibleContent className="mt-2">
                      <div className="pl-6 space-y-1">
                        {microflows.map((microflow, index) => (
                          <div
                            key={`${microflow.qualifiedName}-${index}`}
                            className="flex items-center justify-between p-2 rounded border border-border/50 hover:bg-muted/20 transition-colors"
                          >
                            <div className="flex flex-col">
                              <span className="font-medium text-sm">{microflow.name}</span>
                              <span className="text-xs text-muted-foreground">{microflow.qualifiedName}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}

                {Object.keys(filteredMicroflowsByModule).length === 0 && searchTerm && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Code className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No microflows found matching "{searchTerm}"</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Code className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No microflows data available</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}