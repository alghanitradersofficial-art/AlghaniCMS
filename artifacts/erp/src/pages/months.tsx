import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMemo, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function MonthsPage() {
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: overview, error: overviewError } = useQuery({ queryKey: ["financial-period-overview"], queryFn: () => apiGet(`/api/months/overview`) });
  const { data: closures, error: closuresError } = useQuery({ queryKey: ["months-closures"], queryFn: () => apiGet(`/api/months`) });

  const summaryCards = useMemo(() => [
    { label: "Current financial month", value: `${monthNames[(month - 1) % 12]} ${year}` },
    { label: "Current status", value: overview?.period?.status ?? "open" },
    { label: "Closing progress", value: `${overview?.warnings?.length ? "Needs attention" : "Ready to close"}` },
    { label: "Last closed month", value: closures?.data?.[0] ? `${closures.data[0].year}-${String(closures.data[0].month).padStart(2, "0")}` : "None" },
  ], [closures, month, overview, year]);

  async function handleClose() {
    try {
      setStatusMessage(null);
      await apiPost(`/api/months/close`, { year, month });
      qc.invalidateQueries({ queryKey: ["months-closures"] });
      qc.invalidateQueries({ queryKey: ["financial-period-overview"] });
      setStatusMessage("Month closed successfully.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to close month right now.");
    }
  }

  async function handleReopen() {
    try {
      setStatusMessage(null);
      await apiPost(`/api/months/reopen`, { year, month, reason: "Administrator reopened the month" });
      qc.invalidateQueries({ queryKey: ["months-closures"] });
      qc.invalidateQueries({ queryKey: ["financial-period-overview"] });
      setStatusMessage("Month reopened successfully.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to reopen month right now.");
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Financial Periods</h1>
            <p className="text-sm text-muted-foreground">Professional month closing, historical snapshots, and carry-forward controls.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-md border px-3 py-2">
              {Array.from({ length: 5 }).map((_, i) => {
                const y = new Date().getFullYear() - i;
                return <option key={y} value={y}>{y}</option>;
              })}
            </select>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="rounded-md border px-3 py-2">
              {Array.from({ length: 12 }).map((_, i) => <option key={i + 1} value={i + 1}>{monthNames[i]}</option>)}
            </select>
            <Button onClick={handleClose}>Close Month</Button>
            <Button variant="outline" onClick={handleReopen}>Reopen</Button>
          </div>
        </div>

        {statusMessage && <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">{statusMessage}</div>}
        {(overviewError || closuresError) && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">Unable to load financial period data. Please refresh the page or try again shortly.</div>}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <Card key={card.label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-semibold">{card.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Monthly closing dashboard</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border p-4">
                <div className="text-sm font-semibold">Warnings</div>
                <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                  {(overview?.warnings ?? []).length ? overview.warnings.map((warning: string) => <li key={warning}>• {warning}</li>) : <li>No critical warnings.</li>}
                </ul>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-sm font-semibold">Snapshot summary</div>
                <div className="mt-2 space-y-2 text-sm text-muted-foreground">
                  <div>Sales: Rs. {Number(overview?.summary?.salesSummary?.totalSales ?? 0).toLocaleString()}</div>
                  <div>Net profit: Rs. {Number(overview?.summary?.profitSummary?.netProfit ?? 0).toLocaleString()}</div>
                  <div>Closing stock: Rs. {Number(overview?.summary?.inventorySummary?.closingStockValue ?? 0).toLocaleString()}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Historical closures</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {closures?.data?.map((c: any) => (
                <div key={c.id} className="flex flex-col gap-2 rounded-lg border p-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-semibold">{c.year}-{String(c.month).padStart(2, "0")}</div>
                    <div className="text-sm text-muted-foreground">Created: {format(new Date(c.created_at), "d MMM yyyy HH:mm")}</div>
                  </div>
                  <div className="text-right text-sm">
                    <div>Total Sales: Rs. {Number(c.total_sales).toLocaleString()}</div>
                    <div>Closing Stock: Rs. {Number(c.closing_stock_value).toLocaleString()}</div>
                  </div>
                </div>
              ))}
              {!closures?.data?.length && <div className="text-muted-foreground">No closures yet.</div>}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
