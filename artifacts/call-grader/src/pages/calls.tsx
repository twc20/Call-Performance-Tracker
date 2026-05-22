import { useListCalls } from "@workspace/api-client-react";
import { useState } from "react";
import { format } from "date-fns";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, Phone, PhoneIncoming, PhoneOutgoing } from "lucide-react";
import { useEffect, useState as useStateHook } from "react";

function useDebounce<T>(value: T, delay = 500): T {
  const [v, setV] = useStateHook<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function CallsPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);
  const [direction, setDirection] = useState<"all" | "inbound" | "outbound">("all");
  const [status, setStatus] = useState<"all" | "answered" | "missed">("all");
  const [page, setPage] = useState(0);
  const limit = 50;

  const { data, isLoading } = useListCalls({
    search: debouncedSearch || undefined,
    direction: direction,
    status: status,
    limit,
    offset: page * limit
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Call Log</h1>
          <p className="text-muted-foreground mt-2">
            Browse and filter all synced calls.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 p-4 bg-card border rounded-lg shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search phone or name..." 
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Select value={direction} onValueChange={(v: any) => setDirection(v)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Direction" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Directions</SelectItem>
              <SelectItem value="inbound">Inbound</SelectItem>
              <SelectItem value="outbound">Outbound</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v: any) => setStatus(v)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="answered">Answered</SelectItem>
              <SelectItem value="missed">Missed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-3 font-medium">Date & Time</th>
                <th className="px-4 py-3 font-medium">Direction</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Store</th>
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Grade</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Loading calls...</td>
                </tr>
              ) : data?.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No calls found matching criteria</td>
                </tr>
              ) : (
                data?.items.map((call) => (
                  <tr key={call.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium whitespace-nowrap">
                      <Link href={`/calls/${call.id}`} className="hover:underline hover:text-primary">
                        {format(new Date(call.callDatetime), "MMM d, yyyy h:mm a")}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {call.direction === "inbound" ? (
                        <span className="flex items-center gap-1 text-blue-600"><PhoneIncoming className="w-3 h-3" /> In</span>
                      ) : (
                        <span className="flex items-center gap-1 text-green-600"><PhoneOutgoing className="w-3 h-3" /> Out</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{call.customerPhone}</div>
                      {call.customerName && <div className="text-xs text-muted-foreground">{call.customerName}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{call.store}</td>
                    <td className="px-4 py-3 text-muted-foreground">{call.employee || "-"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{Math.floor(call.durationSeconds / 60)}m {call.durationSeconds % 60}s</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-medium ${
                        call.displayStatus.toLowerCase() === "missed" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
                      }`}>
                        {call.displayStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {call.gradeStatus === "graded" && call.overallGrade !== null && call.overallGrade !== undefined ? (
                        <span className={`font-semibold ${call.overallGrade >= 80 ? "text-green-600" : call.overallGrade < 50 ? "text-destructive" : "text-primary"}`}>
                          {call.overallGrade}%
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                          {call.gradeStatus}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {data && data.total > limit && (
          <div className="p-4 border-t flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {page * limit + 1} to Math.min((page + 1) * limit, data.total) of {data.total}
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                Previous
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => p + 1)}
                disabled={(page + 1) * limit >= data.total}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

