import { useGetEmployeeCoaching, getGetEmployeeCoachingQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { ChevronLeft, Award, ThumbsUp, TrendingUp, Phone, Clock } from "lucide-react";
import { format } from "date-fns";
import { 
  Radar, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  ResponsiveContainer 
} from "recharts";

export function EmployeeCoachingPage() {
  const { name } = useParams<{ name: string }>();
  const decodedName = decodeURIComponent(name || "");
  
  const { data, isLoading, error } = useGetEmployeeCoaching(decodedName, { query: { enabled: !!decodedName, queryKey: getGetEmployeeCoachingQueryKey(decodedName) } });

  if (isLoading) return <div className="p-8">Loading report card...</div>;
  if (error || !data) return <div className="p-8 text-destructive">Error loading coaching data</div>;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
        <Link href="/employees" className="hover:text-foreground flex items-center gap-1 transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back to Roster
        </Link>
      </div>

      <div className="flex flex-col md:flex-row gap-8 items-start">
        {/* Profile Header & Score */}
        <div className="w-full md:w-1/3 space-y-6">
          <div className="p-6 bg-card border rounded-lg shadow-sm text-center space-y-4">
            <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-2xl">
              {data.employee.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold">{data.employee}</h1>
              <p className="text-muted-foreground">{data.store || "Unknown Store"}</p>
            </div>
            
            <div className="pt-4 border-t">
              <div className="text-sm font-medium text-muted-foreground mb-2">Average Grade</div>
              <div className="text-5xl font-black text-primary">{data.averageGrade.toFixed(1)}%</div>
              <div className="text-xs text-muted-foreground mt-2">Based on {data.gradedCalls} graded calls</div>
            </div>
          </div>

          <div className="p-6 bg-card border rounded-lg shadow-sm space-y-4">
            <h3 className="font-semibold flex items-center gap-2 text-green-600">
              <ThumbsUp className="w-4 h-4" /> Top Strengths
            </h3>
            <ul className="space-y-2 text-sm">
              {data.topStrengths && data.topStrengths.length > 0 ? (
                data.topStrengths.map((s, i) => (
                  <li key={i} className="flex gap-2 items-start">
                    <span className="text-green-500 font-bold">•</span>
                    <span>{s}</span>
                  </li>
                ))
              ) : (
                <li className="text-muted-foreground">Not enough data</li>
              )}
            </ul>

            <h3 className="font-semibold flex items-center gap-2 text-amber-600 mt-6 pt-4 border-t">
              <TrendingUp className="w-4 h-4" /> Focus Areas
            </h3>
            <ul className="space-y-2 text-sm">
              {data.topImprovements && data.topImprovements.length > 0 ? (
                data.topImprovements.map((s, i) => (
                  <li key={i} className="flex gap-2 items-start">
                    <span className="text-amber-500 font-bold">•</span>
                    <span>{s}</span>
                  </li>
                ))
              ) : (
                <li className="text-muted-foreground">Not enough data</li>
              )}
            </ul>
          </div>
        </div>

        {/* Detailed Metrics */}
        <div className="w-full md:w-2/3 space-y-6">
          <div className="p-6 bg-card border rounded-lg shadow-sm">
            <h2 className="text-lg font-semibold mb-6">Skills Radar</h2>
            <div className="h-[350px] w-full">
              {data.criterionAverages && data.criterionAverages.length > 2 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data.criterionAverages}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="criterionName" tick={{ fill: "hsl(var(--foreground))", fontSize: 11 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 5]} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <Radar
                      name="Score"
                      dataKey="averageScore"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary))"
                      fillOpacity={0.4}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">Need at least 3 criteria for radar chart</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.bestCall && (
              <div className="p-5 bg-card border border-green-200 dark:border-green-900 rounded-lg shadow-sm space-y-3 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-3 bg-green-50 dark:bg-green-900/20 text-green-600 rounded-bl-lg font-bold">
                  {data.bestCall.overallGrade}%
                </div>
                <h3 className="font-semibold flex items-center gap-2">
                  <Award className="w-4 h-4 text-green-600" /> Best Call
                </h3>
                <div className="text-sm space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground"><Clock className="w-3 h-3" /> {format(new Date(data.bestCall.callDatetime), "MMM d, yyyy")}</div>
                  <div className="flex items-center gap-2 text-muted-foreground"><Phone className="w-3 h-3" /> {data.bestCall.customerPhone}</div>
                </div>
                <Link href={`/calls/${data.bestCall.id}`} className="inline-block text-sm text-primary hover:underline font-medium pt-2">
                  Review Call →
                </Link>
              </div>
            )}
            
            {data.worstCall && (
              <div className="p-5 bg-card border border-amber-200 dark:border-amber-900 rounded-lg shadow-sm space-y-3 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-600 rounded-bl-lg font-bold">
                  {data.worstCall.overallGrade}%
                </div>
                <h3 className="font-semibold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-amber-600" /> Toughest Call
                </h3>
                <div className="text-sm space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground"><Clock className="w-3 h-3" /> {format(new Date(data.worstCall.callDatetime), "MMM d, yyyy")}</div>
                  <div className="flex items-center gap-2 text-muted-foreground"><Phone className="w-3 h-3" /> {data.worstCall.customerPhone}</div>
                </div>
                <Link href={`/calls/${data.worstCall.id}`} className="inline-block text-sm text-primary hover:underline font-medium pt-2">
                  Coach Call →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
