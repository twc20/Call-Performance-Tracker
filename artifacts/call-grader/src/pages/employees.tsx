import { useListEmployees } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Search, User, Store, TrendingUp, Phone } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export function EmployeesPage() {
  const { data: employees, isLoading } = useListEmployees({});
  const [search, setSearch] = useState("");

  const filtered = employees?.filter(e => 
    e.name.toLowerCase().includes(search.toLowerCase()) || 
    (e.store && e.store.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Employees</h1>
          <p className="text-muted-foreground mt-2">
            Roster and high-level performance of your staff.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search employees..." 
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full py-12 text-center text-muted-foreground">Loading employees...</div>
        ) : filtered && filtered.length > 0 ? (
          filtered.map(emp => (
            <Link 
              key={emp.name} 
              href={`/employees/${encodeURIComponent(emp.name)}`}
              className="flex flex-col p-5 bg-card border rounded-lg shadow-sm hover:shadow-md transition-all hover:border-primary/50 group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                    {emp.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">{emp.name}</h3>
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Store className="w-3 h-3" /> {emp.store || "Multiple locations"}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-2 mt-auto pt-4 border-t">
                <div className="text-center">
                  <div className="text-xs text-muted-foreground flex items-center justify-center gap-1 mb-1">
                    <Phone className="w-3 h-3" /> Calls
                  </div>
                  <div className="font-semibold">{emp.totalCalls}</div>
                </div>
                <div className="text-center border-l border-r">
                  <div className="text-xs text-muted-foreground mb-1">Graded</div>
                  <div className="font-semibold">{emp.gradedCalls || 0}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground flex items-center justify-center gap-1 mb-1">
                    <TrendingUp className="w-3 h-3" /> Avg
                  </div>
                  <div className={`font-semibold ${
                    !emp.averageGrade ? "text-muted-foreground" :
                    emp.averageGrade >= 80 ? "text-green-600" : 
                    emp.averageGrade < 50 ? "text-destructive" : "text-primary"
                  }`}>
                    {emp.averageGrade ? `${emp.averageGrade.toFixed(1)}%` : "-"}
                  </div>
                </div>
              </div>
            </Link>
          ))
        ) : (
          <div className="col-span-full py-12 text-center text-muted-foreground">
            No employees found.
          </div>
        )}
      </div>
    </div>
  );
}
