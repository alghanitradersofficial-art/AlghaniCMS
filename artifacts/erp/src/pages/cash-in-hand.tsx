import { useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Wallet, TrendingUp, TrendingDown, Banknote } from "lucide-react";

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type DailyHistoryDay = {
  date: string;
  sales: number;
  purchases: number;
  expenses: number;
  totalIn: number;
  totalOut: number;
  profit: number;
  cashFlow: number;
  cashInHand: number;
  cumulativeProfit: number;
  transactionCount: number;
};

type DailyHistoryResult = {
  year: number;
  month: number;
  days: DailyHistoryDay[];
};

type DayDetail = {
  date: string;
  totalIn: number;
  totalOut: number;
  netFlow: number;
  transactionCount: number;
  byType: Record<
    string,
    Array<{
      id: number;
      partyName?: string | null;
      amount: number;
      direction: string;
      note?: string | null;
      date: string;
    }>
  >;
};

function money(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatDay(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", weekday: "short" });
}

export default function CashInHandPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { data: history, isLoading } = useQuery({
    queryKey: ["cash-in-hand-history", year, month],
    queryFn: () => apiGet<DailyHistoryResult>(`/api/calendar/history?year=${year}&month=${month}`),
  });

  const { data: dayDetail, isLoading: dayLoading } = useQuery({
    queryKey: ["cash-in-hand-day", selectedDate],
    queryFn: () => apiGet<DayDetail>(`/api/calendar/day?date=${selectedDate}`),
    enabled: !!selectedDate,
  });

  const days = history?.days ?? [];

  const summary = useMemo(() => {
    if (days.length === 0) {
      return { openingCash: 0, totalIn: 0, totalOut: 0, closingCash: 0 };
    }
    const totalIn = days.reduce((s, d) => s + d.totalIn, 0);
    const totalOut = days.reduce((s, d) => s + d.totalOut, 0);
    const closingCash = days[days.length - 1].cashInHand;
    const openingCash = days[0].cashInHand - days[0].cashFlow;
    return { openingCash, totalIn, totalOut, closingCash };
  }, [days]);

  const daysWithActivity = days.filter((d) => d.transactionCount > 0);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
              <Wallet className="h-3.5 w-3.5" />
              Cash in Hand
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">Daily Cash Book</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Day-by-day cash movement and running cash-in-hand balance.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-md border px-3 py-2 text-sm"
            >
              {Array.from({ length: 5 }).map((_, i) => {
                const y = now.getFullYear() - i;
                return (
                  <option key={y} value={y}>
                    {y}
                  </option>
                );
              })}
            </select>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="rounded-md border px-3 py-2 text-sm"
            >
              {monthNames.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Opening Cash</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{money(summary.openingCash)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Cash In</CardTitle>
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-emerald-600">{money(summary.totalIn)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Cash Out</CardTitle>
              <TrendingDown className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-red-600">{money(summary.totalOut)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Closing Cash in Hand</CardTitle>
              <Banknote className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{money(summary.closingCash)}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {monthNames[month - 1]} {year} — Daily Ledger
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading…</div>
            ) : daysWithActivity.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No cash transactions recorded for this month.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">Purchases</TableHead>
                    <TableHead className="text-right">Expenses</TableHead>
                    <TableHead className="text-right">Cash In</TableHead>
                    <TableHead className="text-right">Cash Out</TableHead>
                    <TableHead className="text-right">Net Flow</TableHead>
                    <TableHead className="text-right">Cash in Hand</TableHead>
                    <TableHead className="text-right">Txns</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {daysWithActivity.map((d) => (
                    <TableRow
                      key={d.date}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedDate(d.date)}
                    >
                      <TableCell className="font-medium">{formatDay(d.date)}</TableCell>
                      <TableCell className="text-right">{money(d.sales)}</TableCell>
                      <TableCell className="text-right">{money(d.purchases)}</TableCell>
                      <TableCell className="text-right">{money(d.expenses)}</TableCell>
                      <TableCell className="text-right text-emerald-600">{money(d.totalIn)}</TableCell>
                      <TableCell className="text-right text-red-600">{money(d.totalOut)}</TableCell>
                      <TableCell className={`text-right ${d.cashFlow >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {d.cashFlow >= 0 ? "+" : ""}
                        {money(d.cashFlow)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">{money(d.cashInHand)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">{d.transactionCount}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selectedDate} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedDate ? formatDay(selectedDate) : ""} — Transactions</DialogTitle>
          </DialogHeader>
          {dayLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
          ) : dayDetail ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-md border p-3">
                  <div className="text-muted-foreground">Cash In</div>
                  <div className="font-semibold text-emerald-600">{money(dayDetail.totalIn)}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-muted-foreground">Cash Out</div>
                  <div className="font-semibold text-red-600">{money(dayDetail.totalOut)}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-muted-foreground">Net Flow</div>
                  <div className={`font-semibold ${dayDetail.netFlow >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {money(dayDetail.netFlow)}
                  </div>
                </div>
              </div>

              <div className="max-h-[50vh] space-y-3 overflow-y-auto">
                {Object.entries(dayDetail.byType).map(([type, entries]) => (
                  <div key={type}>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {type}
                    </div>
                    <div className="space-y-1">
                      {entries.map((e) => (
                        <div
                          key={e.id}
                          className="flex items-center justify-between rounded border border-border/40 p-2 text-sm"
                        >
                          <div>
                            <div className="font-medium">{e.partyName || e.note || `#${e.id}`}</div>
                            {e.note && e.partyName && (
                              <div className="text-xs text-muted-foreground">{e.note}</div>
                            )}
                          </div>
                          <div className={e.direction === "credit" ? "text-emerald-600" : "text-red-600"}>
                            {e.direction === "credit" ? "+" : "-"}
                            {money(e.amount)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
