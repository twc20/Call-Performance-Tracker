import {
  useGetDashboardSummary,
  useGetDashboardTrends,
  useGetLeaderboard,
  useGetStoreBreakdown,
  useListStores,
} from "@workspace/api-client-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { PhoneMissed, PhoneCall, TrendingUp, Users, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

export function DashboardPage() {
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [storeSel, setStoreSel] = useState<string>(ALL_STORES);

  const filterParams = {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(storeSel && storeSel !== ALL_STORES ? { store: storeSel } : {}),
  };

  const { data: storesList } = useListStores();
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary(filterParams);
  const { data: trends, isLoading: loadingTrends } = useGetDashboardTrends(filterParams);
  const { data: leaderboard, isLoading: loadingLeaderboard } = useGetLeaderboard(filterParams);
  const { data: storeBreakdown, isLoading: loadingStores } = useGetStoreBreakdown({
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  });

  const applyPreset = (preset: "today" | "7d" | "30d" | "90d" | "all") => {
    if (preset === "all") {
      setFrom("");
      setTo("");
      return;
    }
    const today = todayInDenver();
    setTo(today);
    setFrom(
      preset === "today"
        ? today
        : addDays(today, preset === "7d" ? -6 : preset === "30d" ? -29 : -89),
    );
  };

  const dateFilterActive = Boolean(from || to);
  const filterActive = dateFilterActive || storeSel !== ALL_STORES;
  const isLoading = loadingSummary || loadingTrends || loadingLeaderboard || loadingStores;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Daily performance, conversion metrics, and leaderboard.
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
            <Button type="button" variant="outline" size="sm" onClick={() => applyPreset("7d")}>Last 7 days</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => applyPreset("30d")}>Last 30 days</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => applyPreset("90d")}>Last 90 days</Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                applyPreset("all");
                setStoreSel(ALL_STORES);
              }}
              disabled={!filterActive}
            >
              Clear
            </Button>
          </div>
        </div>
      </div>

      {isLoading && !summary ? (
        <div className="p-8 text-sm text-muted-foreground">Loading dashboard…</div>
      ) : !summary || summary.totalCalls === 0 ? (
        filterActive ? (
          <div className="p-8 text-center text-sm text-muted-foreground border rounded-lg bg-card">
            No calls match the selected filters. Widen the date range or pick a different store.
          </div>
        ) : (
          <EmptyState
            title="No Data Yet"
            description="Run your first Drive sync to start populating your dashboard."
            actionLabel="Go to Settings"
            actionHref="/settings"
            icon={AlertCircle}
          />
        )
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Calls"
              value={summary.totalCalls}
              icon={PhoneCall}
            />
            <StatCard
              title="Avg Grade"
              value={summary.averageGrade ? `${summary.averageGrade.toFixed(1)}%` : "N/A"}
              icon={TrendingUp}
            />
            <StatCard
              title="Missed Calls"
              value={summary.missedCalls}
              subtitle={
                summary.missedAfterHours !== undefined && summary.missedDuringHours !== undefined
                  ? `${summary.missedDuringHours} during hours · ${summary.missedAfterHours} after hours`
                  : `${summary.missedCallbackPct.toFixed(1)}% no callback`
              }
              icon={PhoneMissed}
              trend="down"
            />
            <StatCard
              title="Shoppers Followed Up"
              value={`${summary.shoppersFollowedUpPct.toFixed(1)}%`}
              subtitle={`${summary.shoppersFollowedUp} of ${summary.shoppers}`}
              icon={Users}
              trend="up"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 p-6 bg-card border rounded-lg shadow-sm space-y-4">
              <h2 className="text-lg font-semibold">Call Volume Trend</h2>
              <div className="h-[300px]">
                {trends && trends.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trends} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(v) => format(new Date(v), "MMM d")}
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                        tickLine={false}
                      />
                      <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}
                        labelFormatter={(v) => format(new Date(v + "T12:00:00"), "EEE, MMM d, yyyy")}
                      />
                      <Line type="monotone" dataKey="totalCalls" name="Total" stroke="hsl(var(--foreground))" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="answeredCalls" name="Inbound Answered" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="missedDuringHours" name="Missed (open hours)" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="missedAfterHours" name="Missed (after hours)" stroke="#d97706" strokeWidth={2} dot={false} strokeDasharray="4 4" />
                      <Line type="monotone" dataKey="outboundCalls" name="Outbound" stroke="hsl(var(--muted-foreground))" strokeWidth={1} dot={false} strokeDasharray="2 4" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No trend data</div>
                )}
              </div>
            </div>

            <div className="p-6 bg-card border rounded-lg shadow-sm space-y-4">
              <h2 className="text-lg font-semibold">Top Employees</h2>
              <div className="space-y-4">
                {leaderboard?.slice(0, 5).map((entry, i) => (
                  <Link key={entry.employee} href={`/employees/${encodeURIComponent(entry.employee)}`} className="flex items-center justify-between group hover:bg-muted/50 p-2 -mx-2 rounded-md transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-6 text-center text-muted-foreground font-medium text-sm">{i + 1}</div>
                      <div>
                        <div className="font-medium text-sm group-hover:text-primary transition-colors">{entry.employee}</div>
                        <div className="text-xs text-muted-foreground">{entry.store}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-sm">{entry.averageGrade.toFixed(1)}%</div>
                      <div className="text-xs text-muted-foreground">{entry.gradedCalls} graded</div>
                    </div>
                  </Link>
                ))}
                {(!leaderboard || leaderboard.length === 0) && (
                  <div className="text-sm text-muted-foreground py-4 text-center">No graded calls in this range</div>
                )}
              </div>
            </div>
          </div>

          <div className="p-6 bg-card border rounded-lg shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Store Breakdown</h2>
              {storeSel !== ALL_STORES && (
                <span className="text-xs text-muted-foreground">
                  Table shows all stores; other panels filtered to {storeSel}.
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 font-medium rounded-tl-md">Store</th>
                    <th className="px-4 py-3 font-medium text-right">Total Calls</th>
                    <th className="px-4 py-3 font-medium text-right">Answered</th>
                    <th className="px-4 py-3 font-medium text-right">Missed</th>
                    <th className="px-4 py-3 font-medium text-right">Avg Grade</th>
                    <th className="px-4 py-3 font-medium text-right rounded-tr-md">Shopper Follow-up</th>
                  </tr>
                </thead>
                <tbody>
                  {storeBreakdown?.map((store) => (
                    <tr key={store.store} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{store.store} {store.brand && <span className="text-xs font-normal text-muted-foreground ml-1">{store.brand}</span>}</td>
                      <td className="px-4 py-3 text-right">{store.totalCalls}</td>
                      <td className="px-4 py-3 text-right">{store.answeredCalls}</td>
                      <td className="px-4 py-3 text-right text-destructive">{store.missedCalls}</td>
                      <td className="px-4 py-3 text-right font-medium text-primary">
                        {store.averageGrade ? `${store.averageGrade.toFixed(1)}%` : "-"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {store.shoppersFollowedUpPct !== undefined ? `${store.shoppersFollowedUpPct.toFixed(0)}%` : "-"}
                      </td>
                    </tr>
                  ))}
                  {(!storeBreakdown || storeBreakdown.length === 0) && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No store data available</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ title, value, subtitle, icon: Icon, trend }: { title: string; value: string | number; subtitle?: string; icon: any; trend?: "up" | "down" }) {
  return (
    <div className="p-5 bg-card border rounded-lg shadow-sm space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {subtitle && (
        <p className={`text-xs ${trend === 'down' ? 'text-destructive' : trend === 'up' ? 'text-green-600' : 'text-muted-foreground'}`}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
