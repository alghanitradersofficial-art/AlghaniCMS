import { useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangeSelector, dateRangeToParams, type DateRangeValue } from "@/components/date-range-selector";
import { ExportButtons } from "@/components/export-buttons";
import { apiGet } from "@/lib/api";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { FileBarChart, Wallet } from "lucide-react";
import { Link } from "wouter";

type ReportSummary = {
  current: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    netProfit: number;
    inventoryValue: number;
    expenses: number;
  };
};

type CashReportSummary = {
  openingBalance: number;
  closingBalance: number;
  totalIn: number;
  totalOut: number;
};

export default function Reports() {
  const [range, setRange] = useState<DateRangeValue>({ preset: "all" });
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendingTelegram, setSendingTelegram] = useState(false);
  const [attachFull, setAttachFull] = useState(false);
  const { toast } = useToast();

  const params = dateRangeToParams(range);
  const { data: summary, isLoading } = useQuery({
    queryKey: ["report-summary", params.toString()],
    queryFn: () => apiGet<ReportSummary>(`/api/reports/summary?${params.toString()}`),
  });

  const { data: cashSummary } = useQuery({
    queryKey: ["report-cash-summary", params.toString()],
    queryFn: () => apiGet<CashReportSummary>(`/api/reports/cash?${params.toString()}`),
  });

  const stats = [
    { label: "Revenue", value: summary?.current.revenue },
    { label: "Gross Profit", value: summary?.current.grossProfit },
    { label: "Net Profit", value: summary?.current.netProfit, highlight: (summary?.current.netProfit ?? 0) >= 0 },
    { label: "Inventory Value", value: summary?.current.inventoryValue },
  ];

  return (
    <Layout>
      <div className="space-y-6 sm:space-y-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
              <FileBarChart className="w-5 h-5 sm:w-6 sm:h-6 text-primary" /> Reports
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Simple financial reporting with export-ready summaries.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DateRangeSelector value={range} onChange={setRange} />
            <ExportButtons type="report" compact queryString={params.toString()} />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="border-border bg-card">
              <CardContent className="p-3 sm:p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">{stat.label}</p>
                <p className={`text-base sm:text-xl font-bold ${stat.highlight ? "text-green-400" : "text-secondary"}`}>
                  Rs. {stat.value?.toLocaleString() || 0}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Switch id="attach-full" checked={attachFull} onCheckedChange={(v) => setAttachFull(Boolean(v))} />
            <label htmlFor="attach-full" className="text-sm text-muted-foreground">Attach full workbook</label>
          </div>
          <p className="text-xs text-muted-foreground">Full workbook attachments may be large. Server limits attachment size via `REPORT_ATTACHMENT_MAX_BYTES` (default 5MB). Forcing attach will still send the full file and logs a server warning if over the limit.</p>
          <Button onClick={async () => {
            setSendingEmail(true);
            try {
              const data = await customFetch<{ success: boolean; message?: string }>("/api/email/send-report", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reportType: "full-report", attachFull, from: range.from?.toISOString?.(), to: range.to?.toISOString?.() }),
              });
              if (data.success) toast({ title: "✅ Email sent!" });
              else toast({ title: data.message || "Email failed", variant: "destructive" });
            } catch {
              toast({ title: "Email send failed", variant: "destructive" });
            } finally {
              setSendingEmail(false);
            }
          }} variant="outline" size="sm" className="border-border gap-2 text-xs" disabled={sendingEmail}>
            Send Report Email
          </Button>

          <Button onClick={async () => {
            setSendingTelegram(true);
            try {
              const data = await customFetch<{ success: boolean; error?: string }>("/api/telegram/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reportType: "summary" }),
              });
              if (data.success) toast({ title: "✅ Telegram sent!" });
              else toast({ title: data.error || "Telegram failed", variant: "destructive" });
            } catch {
              toast({ title: "Telegram send failed", variant: "destructive" });
            } finally {
              setSendingTelegram(false);
            }
          }} variant="outline" size="sm" className="border-border gap-2 text-xs" disabled={sendingTelegram}>
            Send to Telegram
          </Button>
        </div>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2"><Wallet className="w-4 h-4 text-primary" /> Cash in Hand</CardTitle>
            <Link href="/cash-in-hand">
              <Button variant="ghost" size="sm" className="text-xs">View full report →</Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Opening</p>
                <p className="text-sm font-semibold">Rs. {(cashSummary?.openingBalance ?? 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Cash In</p>
                <p className="text-sm font-semibold text-green-400">Rs. {(cashSummary?.totalIn ?? 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Cash Out</p>
                <p className="text-sm font-semibold text-red-400">Rs. {(cashSummary?.totalOut ?? 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Closing</p>
                <p className="text-sm font-semibold text-primary">Rs. {(cashSummary?.closingBalance ?? 0).toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Profit & Loss Snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-48 sm:h-64 flex items-center justify-center text-muted-foreground text-sm">Loading report data...</div>
            ) : (
              <div className="h-48 sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      {
                        label: "This period",
                        sales: summary?.current.revenue || 0,
                        profit: summary?.current.grossProfit || 0,
                        purchases: summary?.current.cogs || 0,
                      },
                    ]}
                    margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" stroke="#888" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis
                      stroke="#888"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `${value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        borderColor: "hsl(var(--border))",
                        color: "hsl(var(--foreground))",
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="sales" name="Revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="profit" name="Gross Profit" fill="hsl(var(--secondary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="purchases" name="COGS" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
