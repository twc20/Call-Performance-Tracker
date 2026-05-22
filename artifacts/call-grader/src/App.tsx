import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { LayoutDashboard, Inbox, Phone, Users, FileText, Settings, Activity } from "lucide-react";
import { useGetSyncStatus, getGetSyncStatusQueryKey } from "@workspace/api-client-react";

import { InboxPage } from "@/pages/inbox";
import { SettingsPage } from "@/pages/settings";
import { DashboardPage } from "@/pages/dashboard";
import { CallsPage } from "@/pages/calls";
import { CallDetailPage } from "@/pages/call-detail";
import { EmployeesPage } from "@/pages/employees";
import { EmployeeCoachingPage } from "@/pages/employee-coaching";
import { RubricPage } from "@/pages/rubric";

const queryClient = new QueryClient();

function SyncPill() {
  const { data } = useGetSyncStatus({ query: { queryKey: getGetSyncStatusQueryKey(), refetchInterval: (q) => q.state.data?.running ? 5000 : false } });
  
  if (!data) return null;
  
  return (
    <Link href="/settings" className="flex items-center gap-2 px-3 py-1.5 bg-sidebar-accent rounded-full text-xs font-medium text-sidebar-foreground hover:bg-sidebar-accent/80 transition-colors">
      <Activity className={`w-3 h-3 ${data.running ? "animate-pulse text-primary" : "text-muted-foreground"}`} />
      <span>{data.running ? "Syncing..." : "Synced"}</span>
      <span className="text-muted-foreground ml-1">
        {data.pendingGrade ? `${data.pendingGrade} pending` : `${data.gradedCalls}/${data.totalCalls} calls`}
      </span>
    </Link>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  
  const nav = [
    { path: "/", label: "Inbox", icon: Inbox },
    { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { path: "/calls", label: "Calls", icon: Phone },
    { path: "/employees", label: "Employees", icon: Users },
    { path: "/rubric", label: "Rubric", icon: FileText },
    { path: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
          <Link href="/" className="font-bold text-lg text-sidebar-foreground flex items-center gap-2 hover:opacity-80">
            <div className="w-6 h-6 bg-primary rounded-sm flex items-center justify-center text-primary-foreground">
              <span className="text-xs font-black">DT</span>
            </div>
            Call Grader
          </Link>
        </div>
        
        <div className="px-4 py-4 pb-2">
          <SyncPill />
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {nav.map((item) => {
            // Precise active matching
            const isActive = item.path === "/" 
              ? location === "/" 
              : location === item.path || location.startsWith(item.path + "/");
              
            return (
              <Link 
                key={item.path} 
                href={item.path}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      
      <main className="flex-1 overflow-y-auto bg-background">
        {children}
      </main>
    </div>
  );
}

function Router() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={InboxPage} />
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/calls" component={CallsPage} />
        <Route path="/calls/:id" component={CallDetailPage} />
        <Route path="/employees" component={EmployeesPage} />
        <Route path="/employees/:name" component={EmployeeCoachingPage} />
        <Route path="/rubric" component={RubricPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
