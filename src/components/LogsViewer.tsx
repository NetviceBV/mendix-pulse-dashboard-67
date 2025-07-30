import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Download, X, Calendar, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";

interface WebhookLog {
  id: string;
  timestamp: string;
  level: string;
  node?: string;
  message: string;
  stacktrace?: string;
}

interface LogsViewerProps {
  open: boolean;
  onClose: () => void;
  logs: string;
  webhookLogs: WebhookLog[];
  environmentName: string;
  appName: string;
  appId: string;
  onDownloadDate: (date: Date) => void;
  onRefreshWebhookLogs: () => void;
  loading?: boolean;
  webhookLoading?: boolean;
}

const LogsViewer = ({ 
  open, 
  onClose, 
  logs, 
  webhookLogs,
  environmentName, 
  appName, 
  appId,
  onDownloadDate,
  onRefreshWebhookLogs,
  loading = false,
  webhookLoading = false
}: LogsViewerProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("webhook");

  const keywords = ["Error", "Critical", "Warning", "Exception", "Failed", "Autocommit"];

  const getLevelColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error':
      case 'critical':
        return 'text-destructive';
      case 'warning':
        return 'text-warning';
      case 'info':
        return 'text-info';
      default:
        return 'text-foreground';
    }
  };

  const getLevelBadgeVariant = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error':
      case 'critical':
        return 'destructive';
      case 'warning':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const highlightKeywords = (text: string, searchTerm: string) => {
    if (!searchTerm) return text;
    
    const parts = text.split(new RegExp(`(${searchTerm})`, 'gi'));
    return parts.map((part, index) => 
      part.toLowerCase() === searchTerm.toLowerCase() ? 
        `<mark class="bg-warning/30 text-warning-foreground px-1 rounded">${part}</mark>` : 
        part
    ).join('');
  };

  const filterLogs = (logs: string, searchTerm: string) => {
    if (!searchTerm) return logs;
    
    const lines = logs.split('\n');
    const filteredLines = lines.filter(line => 
      line.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    return filteredLines.join('\n');
  };

  const filteredLogs = filterLogs(logs, searchTerm);
  const highlightedLogs = highlightKeywords(filteredLogs, searchTerm);

  const filteredWebhookLogs = webhookLogs.filter(log => 
    !searchTerm || 
    log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.level.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (log.node && log.node.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const downloadLogs = () => {
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${appName}-${environmentName}-logs-${format(new Date(), 'yyyy-MM-dd')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      onDownloadDate(date);
      setCalendarOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Logs - {appName} ({environmentName})</span>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 flex-1 min-h-0">
          {/* Controls */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <div className="flex gap-2">
              {activeTab === "webhook" && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={onRefreshWebhookLogs}
                  disabled={webhookLoading}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${webhookLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              )}
              
              {activeTab === "file" && (
                <>
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Calendar className="w-4 h-4 mr-2" />
                        {selectedDate ? format(selectedDate, 'MMM dd, yyyy') : 'Select Date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <CalendarComponent
                        mode="single"
                        selected={selectedDate}
                        onSelect={handleDateSelect}
                        disabled={(date) => date > new Date()}
                      />
                    </PopoverContent>
                  </Popover>

                  <Button variant="outline" size="sm" onClick={downloadLogs}>
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Keyword badges */}
          <div className="flex gap-2 flex-wrap">
            {keywords.map((keyword) => (
              <Badge
                key={keyword}
                variant={searchTerm === keyword ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setSearchTerm(searchTerm === keyword ? "" : keyword)}
              >
                {keyword}
              </Badge>
            ))}
          </div>

          {/* Tabs for different log types */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="webhook">
                Real-time Logs ({filteredWebhookLogs.length})
              </TabsTrigger>
              <TabsTrigger value="file">
                File Logs
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="webhook" className="flex-1 min-h-0 mt-4">
              <Card className="h-full">
                <CardContent className="p-0 h-full">
                  {webhookLoading ? (
                    <div className="flex items-center justify-center h-64">
                      <div className="text-center space-y-2">
                        <div className="w-8 h-8 bg-primary rounded mx-auto animate-pulse"></div>
                        <p className="text-sm text-muted-foreground">Loading webhook logs...</p>
                      </div>
                    </div>
                  ) : filteredWebhookLogs.length > 0 ? (
                    <ScrollArea className="h-full max-h-96">
                      <div className="p-4 space-y-3">
                        {filteredWebhookLogs.map((log) => (
                          <div key={log.id} className="border-l-4 border-l-muted pl-4 py-2 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Badge variant={getLevelBadgeVariant(log.level)}>
                                  {log.level}
                                </Badge>
                                {log.node && (
                                  <span className="text-xs text-muted-foreground">{log.node}</span>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(log.timestamp), 'MMM dd, yyyy HH:mm:ss')}
                              </span>
                            </div>
                            <p className={`text-sm ${getLevelColor(log.level)}`}>
                              {log.message}
                            </p>
                            {log.stacktrace && log.stacktrace !== 'null' && (
                              <pre className="text-xs text-muted-foreground bg-muted p-2 rounded overflow-x-auto">
                                {log.stacktrace}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="flex items-center justify-center h-64">
                      <p className="text-sm text-muted-foreground">No webhook logs available</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="file" className="flex-1 min-h-0 mt-4">
              <Card className="h-full">
                <CardContent className="p-0 h-full">
                  {loading ? (
                    <div className="flex items-center justify-center h-64">
                      <div className="text-center space-y-2">
                        <div className="w-8 h-8 bg-primary rounded mx-auto animate-pulse"></div>
                        <p className="text-sm text-muted-foreground">Loading file logs...</p>
                      </div>
                    </div>
                  ) : logs ? (
                    <ScrollArea className="h-full max-h-96">
                      <pre 
                        className="p-4 text-xs font-mono whitespace-pre-wrap break-words"
                        dangerouslySetInnerHTML={{ __html: highlightedLogs || "No file logs available" }}
                      />
                    </ScrollArea>
                  ) : (
                    <div className="flex items-center justify-center h-64">
                      <p className="text-sm text-muted-foreground">
                        Select a date above to download file logs
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LogsViewer;