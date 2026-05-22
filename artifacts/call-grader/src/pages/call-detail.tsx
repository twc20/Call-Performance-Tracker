import { useGetCall, useRegradeCall, getGetCallQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { format } from "date-fns";
import { PhoneIncoming, PhoneOutgoing, Store, User, Clock, Calendar, RefreshCw, ChevronLeft, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

export function CallDetailPage() {
  const { id } = useParams<{ id: string }>();
  const callId = parseInt(id || "0", 10);
  
  const { data: detail, isLoading, error } = useGetCall(callId, { query: { enabled: !!callId, queryKey: getGetCallQueryKey(callId) } });
  const regrade = useRegradeCall();
  const queryClient = useQueryClient();

  if (isLoading) return <div className="p-8">Loading call details...</div>;
  if (error || !detail) return <div className="p-8 text-destructive">Error loading call</div>;

  const { call, transcript, summary, grade, relatedCalls, followUp } = detail;

  const handleRegrade = async () => {
    try {
      await regrade.mutateAsync({ id: callId });
      queryClient.invalidateQueries({ queryKey: getGetCallQueryKey(callId) });
      toast.success("Regrade started");
    } catch (e) {
      toast.error("Failed to start regrade");
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
        <Link href="/calls" className="hover:text-foreground flex items-center gap-1 transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back to Calls
        </Link>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            {call.customerName ?? (call.customerPhone !== "unknown" ? call.customerPhone : "Unknown caller")}
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
              call.displayStatus.toLowerCase() === "missed" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
            }`}>
              {call.displayStatus}
            </span>
          </h1>
          {call.customerName && call.customerPhone !== "unknown" && (
            <p className="text-muted-foreground mt-1 text-lg">{call.customerPhone}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRegrade} disabled={regrade.isPending}>
            <RefreshCw className={`w-4 h-4 mr-2 ${regrade.isPending ? "animate-spin" : ""}`} />
            Regrade Call
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Left Column: Metadata & Transcript */}
        <div className="md:col-span-3 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-5 bg-card border rounded-lg shadow-sm">
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Date
              </span>
              <div className="text-sm font-medium">{format(new Date(call.callDatetime), "MMM d, yyyy")}</div>
              <div className="text-xs text-muted-foreground">{format(new Date(call.callDatetime), "h:mm a")}</div>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                {call.direction === "inbound" ? <PhoneIncoming className="w-3 h-3" /> : <PhoneOutgoing className="w-3 h-3" />} 
                Direction
              </span>
              <div className="text-sm font-medium capitalize">{call.direction}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> {Math.floor(call.durationSeconds / 60)}m {call.durationSeconds % 60}s
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Store className="w-3 h-3" /> Store
              </span>
              <div className="text-sm font-medium">{call.store}</div>
              {call.brand && <div className="text-xs text-muted-foreground">{call.brand}</div>}
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <User className="w-3 h-3" /> Employee
              </span>
              <div className="text-sm font-medium">{call.employee || "Unknown"}</div>
            </div>
          </div>

          {summary && summary.length > 0 && (
            <div className="p-6 bg-card border rounded-lg shadow-sm space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-primary/20 text-primary flex items-center justify-center text-xs">✨</span>
                AI Summary
              </h3>
              <ul className="list-disc list-inside space-y-1 ml-4 text-sm text-muted-foreground">
                {summary.map((point, i) => <li key={i}>{point}</li>)}
              </ul>
            </div>
          )}

          <div className="bg-card border rounded-lg shadow-sm overflow-hidden flex flex-col max-h-[600px]">
            <div className="p-4 border-b bg-muted/30 font-semibold">Transcript</div>
            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {!transcript || transcript.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">No transcript available</div>
              ) : (
                transcript.map((line, i) => {
                  const isAgent = line.speaker.toLowerCase().includes("agent") || line.speaker === call.employee;
                  return (
                    <div key={i} className={`flex gap-3 text-sm ${isAgent ? "flex-row-reverse" : ""}`}>
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-xs font-medium">
                        {isAgent ? "A" : "C"}
                      </div>
                      <div className={`max-w-[80%] rounded-lg p-3 ${isAgent ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                        <div className="flex items-center gap-2 mb-1 text-[10px] opacity-70">
                          <span className="font-bold uppercase tracking-wider">{line.speaker}</span>
                          <span>{line.timestamp}</span>
                        </div>
                        <p className="leading-relaxed">{line.text}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Grade Card & Related */}
        <div className="space-y-6">
          {grade ? (
            <div className="p-6 bg-sidebar border rounded-lg shadow-sm text-sidebar-foreground space-y-6">
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-sidebar-primary/20 text-sidebar-primary mb-2">
                  <Award className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold">Grade Card</h3>
                <div className="text-4xl font-black">{grade.overallScore}%</div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-semibold uppercase tracking-wider text-sidebar-foreground/70">Criteria</h4>
                {grade.criterionScores.map(score => (
                  <div key={score.criterionId} className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium truncate pr-2">{score.criterionName}</span>
                      <span className="font-mono">{score.score}/5</span>
                    </div>
                    <div className="h-1.5 w-full bg-sidebar-accent rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-sidebar-primary rounded-full transition-all" 
                        style={{ width: `${(score.score / 5) * 100}%` }}
                      />
                    </div>
                    {score.note && <p className="text-xs text-sidebar-foreground/60 italic mt-1">{score.note}</p>}
                  </div>
                ))}
              </div>

              {grade.coachingNotes && (
                <div className="pt-4 border-t border-sidebar-border space-y-2">
                  <h4 className="text-sm font-semibold text-sidebar-primary">Coaching Note</h4>
                  <p className="text-sm text-sidebar-foreground/80 leading-relaxed">{grade.coachingNotes}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 bg-card border rounded-lg shadow-sm text-center py-12 text-muted-foreground">
              <p className="text-sm">Not graded yet</p>
              <p className="text-xs mt-1">Status: {call.gradeStatus}</p>
            </div>
          )}

          {relatedCalls && relatedCalls.length > 0 && (
            <div className="p-5 bg-card border rounded-lg shadow-sm space-y-4">
              <h3 className="font-semibold text-sm">Related Calls</h3>
              <div className="space-y-3">
                {relatedCalls.map(rc => (
                  <Link key={rc.id} href={`/calls/${rc.id}`} className="block p-3 rounded bg-muted/50 hover:bg-muted transition-colors text-sm">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium">{format(new Date(rc.callDatetime), "MMM d")}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${rc.displayStatus.toLowerCase() === "missed" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
                        {rc.displayStatus}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground flex justify-between">
                      <span className="capitalize">{rc.direction}</span>
                      <span>{rc.employee || "Unknown"}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
