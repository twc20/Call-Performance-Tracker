import { useGetInbox, useResolveInboxItem, useListStores, getGetInboxQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import type { InboxItem } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Phone, User, Store, CheckCircle, Clock, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";

const ALL_STORES = "__all__";

function todayInDenver(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type KindFilter =
  | "shopper_no_followup"
  | "missed_voicemail"
  | "missed_no_callback"
  | "missed_after_hours";

const FILTER_OPTIONS: Array<{
  key: KindFilter;
  label: string;
  activeClass: string;
  inactiveClass: string;
}> = [
  {
    key: "shopper_no_followup",
    label: "Missed Follow-ups",
    activeClass: "bg-primary text-primary-foreground border-primary",
    inactiveClass: "bg-background text-muted-foreground border-border hover:text-foreground",
  },
  {
    key: "missed_voicemail",
    label: "Voicemails",
    activeClass: "bg-purple-600 text-white border-purple-600 dark:bg-purple-500 dark:border-purple-500",
    inactiveClass: "bg-background text-muted-foreground border-border hover:text-foreground",
  },
  {
    key: "missed_no_callback",
    label: "Missed (Open Hours)",
    activeClass: "bg-destructive text-destructive-foreground border-destructive",
    inactiveClass: "bg-background text-muted-foreground border-border hover:text-foreground",
  },
  {
    key: "missed_after_hours",
    label: "Missed (After Hours)",
    activeClass: "bg-amber-500 text-white border-amber-500 dark:bg-amber-600 dark:border-amber-600",
    inactiveClass: "bg-background text-muted-foreground border-border hover:text-foreground",
  },
];

export function InboxPage() {
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [storeSel, setStoreSel] = useState<string>(ALL_STORES);
  const { data: storesList } = useListStores();
  const { data: items, isLoading, error } = useGetInbox({
    includeResolved: false,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(storeSel !== ALL_STORES ? { store: storeSel } : {}),
  });
  const resolve = useResolveInboxItem();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState<Record<KindFilter, boolean>>({
    shopper_no_followup: true,
    missed_voicemail: true,
    missed_no_callback: true,
    missed_after_hours: true,
  });

  const applyPreset = (preset: "today" | "yesterday" | "7d" | "30d" | "all") => {
    if (preset === "all") {
      setFrom("");
      setTo("");
      return;
    }
    const today = todayInDenver();
    if (preset === "yesterday") {
      const y = addDays(today, -1);
      setFrom(y);
      setTo(y);
      return;
    }
    setTo(today);
    setFrom(preset === "today" ? today : addDays(today, preset === "7d" ? -6 : -29));
  };

  const toggle = (k: KindFilter) =>
    setEnabled((prev) => ({ ...prev, [k]: !prev[k] }));

  const filtered = useMemo(
    () => (items ?? []).filter((i) => enabled[i.kind as KindFilter] ?? true),
    [items, enabled],
  );

  if (error) return <div className="p-8 text-destructive">Error loading inbox</div>;

  const handleResolve = async (id: number) => {
    try {
      await resolve.mutateAsync({ id, data: { resolved: true } });
      queryClient.invalidateQueries({ queryKey: getGetInboxQueryKey() });
      toast.success("Item resolved");
    } catch (e) {
      toast.error("Failed to resolve item");
    }
  };

  const counts = (items ?? []).reduce<Record<string, number>>((acc, i) => {
    acc[i.kind] = (acc[i.kind] ?? 0) + 1;
    return acc;
  }, {});

  const dateFilterActive = Boolean(from || to);
  const storeFilterActive = storeSel !== ALL_STORES;
  const anyFilterActive = dateFilterActive || storeFilterActive;
  const totalLoaded = items?.length ?? 0;
  const hasZeroFromFilter = !isLoading && anyFilterActive && totalLoaded === 0;
  const isInboxZero = !isLoading && !anyFilterActive && totalLoaded === 0;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Missed Opportunities</h1>
        <p className="text-muted-foreground mt-2">
          Review calls that need your attention. Follow up to close sales.
        </p>
      </div>

      <div className="flex flex-col gap-3 p-4 bg-card border rounded-lg">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Store</label>
            <Select value={storeSel} onValueChange={setStoreSel}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="All stores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STORES}>All stores</SelectItem>
                {storesList?.map((s) => (
                  <SelectItem key={s.name} value={s.name}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">From</label>
            <Input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              className="w-[160px]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">To</label>
            <Input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              className="w-[160px]"
            />
          </div>
          <div className="flex flex-wrap gap-1.5 pb-0.5">
            <Button type="button" variant="outline" size="sm" onClick={() => applyPreset("today")}>Today</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => applyPreset("yesterday")}>Yesterday</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => applyPreset("7d")}>Last 7 days</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => applyPreset("30d")}>Last 30 days</Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                applyPreset("all");
                setStoreSel(ALL_STORES);
              }}
              disabled={!anyFilterActive}
            >
              Clear
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTER_OPTIONS.map((opt) => {
          const isOn = enabled[opt.key];
          const count = counts[opt.key] ?? 0;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => toggle(opt.key)}
              aria-pressed={isOn}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                isOn ? opt.activeClass : opt.inactiveClass
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isOn ? "bg-current opacity-80" : "border border-current"
                }`}
              />
              {opt.label}
              <span className={`tabular-nums ${isOn ? "opacity-90" : "opacity-70"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        {isLoading
          ? "Loading inbox..."
          : `Showing ${filtered.length} of ${totalLoaded} unresolved ${totalLoaded === 1 ? "item" : "items"}${anyFilterActive ? " matching filters" : ""}, newest first.`}
      </p>

      {isInboxZero ? (
        <EmptyState
          title="Inbox Zero"
          description="All missed opportunities have been addressed. Great job!"
          actionLabel="Go to Dashboard"
          actionHref="/dashboard"
          icon={CheckCircle}
        />
      ) : hasZeroFromFilter ? (
        <div className="p-8 text-center text-sm text-muted-foreground border rounded-lg bg-card">
          No unresolved items match the selected filters. Try widening the date range, picking a different store, or clearing the filter.
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground border rounded-lg bg-card">
          No items match the selected filters. Toggle a category above to see more.
        </div>
      ) : (
      <div className="space-y-8">
        {groupByDate(filtered).map(([date, group]) => (
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
      )}
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
  const label =
    item.kind === "shopper_no_followup"
      ? { text: "Missed Follow-up", className: "bg-primary/10 text-primary" }
      : item.kind === "missed_voicemail"
        ? { text: "Voicemail", className: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200" }
        : item.kind === "missed_after_hours"
          ? { text: "Missed (After Hours)", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" }
          : { text: "Missed Call", className: "bg-destructive/10 text-destructive" };

  return (
    <Link
      href={`/calls/${item.callId}`}
      className="flex flex-col sm:flex-row gap-4 p-5 bg-card border rounded-lg shadow-sm hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group"
    >
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded-md text-xs font-medium ${label.className}`}>
            {label.text}
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
