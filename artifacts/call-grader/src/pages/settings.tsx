import { useGetSyncStatus, useTriggerSync, getGetSyncStatusQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { RefreshCw, CheckCircle2, XCircle, AlertCircle, History } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";

export function SettingsPage() {
  const { data: status, isLoading } = useGetSyncStatus({
    query: { queryKey: getGetSyncStatusQueryKey(), refetchInterval: (q) => q.state.data?.running ? 5000 : false }
  });
  const triggerSync = useTriggerSync();
  const queryClient = useQueryClient();
  const [fullSyncing, setFullSyncing] = useState(false);

  const handleSync = async () => {
    try {
      await triggerSync.mutateAsync({ params: {} });
      queryClient.invalidateQueries({ queryKey: getGetSyncStatusQueryKey() });
      toast.success("Sync started");
    } catch (e) {
      toast.error("Failed to start sync");
    }
  };

  const handleFullBackfill = async () => {
    const confirmed = window.confirm(
      "Full Backfill will walk every folder in the Drive source and ingest ALL historical calls (back to the earliest file).\n\n" +
        "On a fresh database this can take hours and will run Gemini grading on thousands of calls (API cost).\n\n" +
        "Re-running is safe — already-ingested calls are skipped. Proceed?",
    );
    if (!confirmed) return;
    setFullSyncing(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/sync/run?full=true`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok && res.status !== 202) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      queryClient.invalidateQueries({ queryKey: getGetSyncStatusQueryKey() });
      toast.success(body.started ? "Full backfill started" : "Another sync is already running");
    } catch (e) {
      toast.error("Failed to start full backfill");
    } finally {
      setFullSyncing(false);
    }
  };

  if (isLoading) return <div className="p-8">Loading settings...</div>;

  const hasData = status && status.totalCalls > 0;

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage data synchronization and system preferences.
        </p>
      </div>

      <div className="p-6 bg-card border rounded-lg shadow-sm space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-1">Drive Sync</h2>
          <p className="text-sm text-muted-foreground">
            Synchronize call recordings and transcripts from Google Drive.
          </p>
        </div>

        {!hasData && !status?.running && (
          <div className="bg-primary/5 border border-primary/20 rounded-md p-4 flex items-start gap-4">
            <AlertCircle className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <h3 className="font-medium text-primary">First Sync Required</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Your database is currently empty. Run the first sync to populate calls, stores, and employees.
              </p>
            </div>
          </div>
        )}

        {status && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-md bg-muted/50 border">
              <div className="text-sm font-medium text-muted-foreground">Total Calls</div>
              <div className="text-2xl font-bold mt-1">{status.totalCalls}</div>
            </div>
            <div className="p-4 rounded-md bg-muted/50 border">
              <div className="text-sm font-medium text-muted-foreground">Graded Calls</div>
              <div className="text-2xl font-bold mt-1 text-green-600">{status.gradedCalls}</div>
            </div>
            <div className="p-4 rounded-md bg-muted/50 border">
              <div className="text-sm font-medium text-muted-foreground">Pending Grade</div>
              <div className="text-2xl font-bold mt-1 text-amber-600">{status.pendingGrade || 0}</div>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t">
          <div className="flex flex-col">
            <span className="text-sm font-medium">Last Sync</span>
            <span className="text-sm text-muted-foreground flex items-center gap-2">
              {status?.lastSyncStatus === "success" && <CheckCircle2 className="w-4 h-4 text-green-500" />}
              {status?.lastSyncStatus === "error" && <XCircle className="w-4 h-4 text-destructive" />}
              {status?.lastSyncAt ? format(new Date(status.lastSyncAt), "PP pp") : "Never"}
            </span>
            {status?.lastSyncMessage && (
              <span className="text-xs text-muted-foreground mt-1 max-w-md truncate">
                {status.lastSyncMessage}
              </span>
            )}
          </div>
          
          <Button 
            onClick={handleSync} 
            disabled={status?.running || triggerSync.isPending}
            className="w-full sm:w-auto"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${status?.running ? "animate-spin" : ""}`} />
            {status?.running ? "Syncing..." : "Sync Now"}
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-4 border-t">
          <div className="flex flex-col">
            <span className="text-sm font-medium">Full Historical Backfill</span>
            <span className="text-xs text-muted-foreground max-w-md">
              One-time sweep of the entire Drive folder — pulls every historical call (back to the earliest file)
              and grades them. Routine syncs only look at the last 30 days; use this once per environment.
            </span>
          </div>

          <Button
            onClick={handleFullBackfill}
            disabled={status?.running || fullSyncing}
            variant="outline"
            className="w-full sm:w-auto"
          >
            <History className={`w-4 h-4 mr-2 ${fullSyncing || status?.running ? "animate-spin" : ""}`} />
            {status?.running ? "Sync running…" : fullSyncing ? "Starting…" : "Run Full Backfill"}
          </Button>
        </div>
      </div>
    </div>
  );
}
