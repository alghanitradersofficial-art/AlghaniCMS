import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionLoading } from "@/components/loading-state";
import { apiGet } from "@/lib/api";
import { ChevronLeft, ChevronRight, CalendarClock } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from "date-fns";
import { cn } from "@/lib/utils";

type DaySummary = {
  date: string; salesTotal: number; salesCount: number; purchasesTotal: number;
  expensesTotal: number; totalIn: number; totalOut: number; transactionCount: number;
};

type DayDetail = {
  date: string; totalIn: number; totalOut: number; netFlow: number; transactionCount: number;
  byType: Record<string, Array<{ id: number; partyName: string | null; amount: number; direction: string; note: string | null }>>;
};

export default function CalendarPage() {
  const [month, setMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const year = month.getFullYear();
  const monthNum = month.getMonth() + 1;

  const { data, isLoading } = useQuery({
    queryKey: ["calendar-month", year, monthNum],
    queryFn: () => apiGet<{ days: DaySummary[] }>(`/api/calendar/month?year=${year}&month=${monthNum}`),
  });

  const byDate = new Map((data?.days ?? []).map((d) => [d.date, d]));

  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const leadingBlanks = getDay(monthStart);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><CalendarClock className="w-6 h-6 text-primary" /> Calendar</h1>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setMonth((m) => subMonths(m, 1))}><ChevronLeft className="w-4 h-4" /></Button>
            <span className="text-sm font-semibold w-36 text-center">{format(month, "MMMM yyyy")}</span>
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setMonth((m) => addMonths(m, 1))}><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>

        {isLoading ? <SectionLoading label="Loading calendar" /> : (
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="grid grid-cols-7 gap-1.5 mb-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} className="text-center text-xs text-muted-foreground font-medium py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {Array.from({ length: leadingBlanks }).map((_, i) => <div key={`b-${i}`} />)}
                {days.map((d) => {
                  const dateStr = format(d, "yyyy-MM-dd");
                  const summary = byDate.get(dateStr);
                  const hasActivity = summary && summary.transactionCount > 0;
                  return (
                    <button
                      key={dateStr}
                      onClick={() => hasActivity && setSelectedDay(dateStr)}
                      disabled={!hasActivity}
                      className={cn(
                        "aspect-square rounded-md border p-1.5 flex flex-col items-start justify-between text-left transition-colors",
                        hasActivity ? "border-primary/30 bg-primary/5 hover:bg-primary/10 cursor-pointer" : "border-border/40 text-muted-foreground",
                      )}
                    >
                      <span className="text-xs font-medium">{format(d, "d")}</span>
                      {hasActivity && (
                        <div className="w-full space-y-0.5">
                          {summary!.salesCount > 0 && (
                            <span className="text-[10px] block text-emerald-500 font-medium truncate">Rs {Math.round(summary!.salesTotal).toLocaleString()}</span>
                          )}
                          <span className="text-[10px] block text-muted-foreground">{summary!.transactionCount} txn</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <DayDetailDialog date={selectedDay} onClose={() => setSelectedDay(null)} />
    </Layout>
  );
}

function DayDetailDialog({ date, onClose }: { date: string | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["calendar-day", date],
    queryFn: () => apiGet<DayDetail>(`/api/calendar/day?date=${date}`),
    enabled: !!date,
  });

  return (
    <Dialog open={!!date} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{date ? format(new Date(date), "EEEE, d MMMM yyyy") : ""}</DialogTitle></DialogHeader>
        {isLoading ? <SectionLoading label="Loading day detail" /> : data && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border p-3 text-center">
                <p className="text-xs text-muted-foreground">In</p>
                <p className="text-lg font-bold text-emerald-500">Rs {data.totalIn.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-border p-3 text-center">
                <p className="text-xs text-muted-foreground">Out</p>
                <p className="text-lg font-bold text-red-500">Rs {data.totalOut.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-border p-3 text-center">
                <p className="text-xs text-muted-foreground">Net</p>
                <p className={cn("text-lg font-bold", data.netFlow >= 0 ? "text-emerald-500" : "text-red-500")}>Rs {data.netFlow.toLocaleString()}</p>
              </div>
            </div>

            {Object.entries(data.byType).map(([type, entries]) => (
              <div key={type}>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 capitalize">{type.replace("_", " ")}</h4>
                <div className="space-y-1">
                  {entries.map((e) => (
                    <div key={e.id} className="flex items-center justify-between text-sm rounded-md border border-border/50 px-3 py-2">
                      <span className="text-muted-foreground">{e.partyName || e.note || "—"}</span>
                      <span className={cn("font-medium", e.direction === "credit" ? "text-emerald-500" : "text-red-500")}>
                        {e.direction === "credit" ? "+" : "-"}Rs {e.amount.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {data.transactionCount === 0 && <p className="text-center text-muted-foreground py-6 text-sm">No activity on this day</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
