import { useGetInbox, useResolveInboxItem, getGetInboxQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import type { InboxItem } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Phone, User, Store, CheckCircle, Clock, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import { EmptyState } from "@/components/empty-state";

export function InboxPage() {
  const { data: items, isLoading, error } = useGetInbox({ includeResolved: false });
  const resolve = useResolveInboxItem();
  const queryClient = useQueryClient();

  if (isLoading) return <div className="p-8">Loading inbox...</div>;
  if (error) return <div className="p-8 text-destructive">Error loading inbox</div>;

  if (!items || items.length === 0) {
    return (
      <div className="p-8 h-full flex items-center justify-center">
        <EmptyState
          title="Inbox Zero"
          description="All missed opportunities have been addressed. Great job!"
          actionLabel="Go to Dashboard"
          actionHref="/dashboard"
          icon={CheckCircle}
        />
      </div>
    );
  }

  const handleResolve = async (id: number) => {
    try {
      await resolve.mutateAsync({ id, data: { resolved: true } });
      queryClient.invalidateQueries({ queryKey: getGetInboxQueryKey() });
      toast.success("Item resolved");
    } catch (e) {
      toast.error("Failed to resolve item");
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Missed Opportunities</h1>
        <p className="text-muted-foreground mt-2">
          Review calls that need your attention. Follow up to close sales.
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {items.length} unresolved {items.length === 1 ? "item" : "items"}, oldest first.
      </p>

      <div className="space-y-8">
        {groupByDate(items).map(([date, group]) => (
          <section key={date} className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {format(new Date(date + "T12:00:00"), "EEEE, MMM d, yyyy")}
              <span className="ml-2 font-normal normal-case">({group.length})</span>
            </h2>
            <div className="grid gap-4">
              {group.map((item) => (
                <InboxCard key={item.id} item={item} onResolve={() => handleResolve(item.id)} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function groupByDate(items: InboxItem[]): Array<[string, InboxItem[]]> {
  const map = new Map<string, InboxItem[]>();
  for (const item of items) {
    // Use Mountain-time local date so late-night calls group with the operator's
    // workday, matching how the backend buckets call_date.
    const d = new Date(item.callDatetime);
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Denver",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    const arr = map.get(key) ?? [];
    arr.push(item);
    map.set(key, arr);
  }
  return Array.from(map.entries());
}

function InboxCard({ item, onResolve }: { item: InboxItem; onResolve: () => void }) {
  const isShopper = item.kind === "shopper_no_followup";

  return (
    <Link
      href={`/calls/${item.callId}`}
      className="flex flex-col sm:flex-row gap-4 p-5 bg-card border rounded-lg shadow-sm hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group"
    >
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded-md text-xs font-medium ${isShopper ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
            {isShopper ? "Missed Follow-up" : "Missed Call"}
          </span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {format(new Date(item.callDatetime), "MMM d, h:mm a")}
          </span>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="text-sm font-medium flex items-center gap-2">
              {item.customerName ? (
                <>
                  <User className="w-4 h-4 text-muted-foreground" />
                  {item.customerName}
                </>
              ) : (
                <>
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  {item.customerPhone !== "unknown" ? item.customerPhone : "Unknown caller"}
                </>
              )}
            </div>
            {item.customerName && item.customerPhone !== "unknown" && (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Phone className="w-4 h-4" />
                {item.customerPhone}
              </div>
            )}
          </div>
          
          <div className="space-y-1">
            <div className="text-sm flex items-center gap-2">
              <Store className="w-4 h-4 text-muted-foreground" />
              {item.store}
            </div>
            {item.employee && (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <User className="w-4 h-4" />
                {item.employee}
              </div>
            )}
          </div>
        </div>
        
        {item.summary && (
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
            {item.summary}
          </p>
        )}
      </div>
      
      <div className="flex items-center justify-end gap-2 sm:border-l sm:pl-4">
        <Button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onResolve();
          }}
          variant="outline"
          className="w-full sm:w-auto"
        >
          Mark Resolved
        </Button>
        <ChevronRight className="hidden sm:block w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
      </div>
    </Link>
  );
}
