import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useGetProfitLossReport, useGetInventoryReport } from "@workspace/api-client-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { FileBarChart, TrendingUp, TrendingDown, Package, Download, Send, Mail, MessageSquare } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const PERIODS = ["daily", "weekly", "monthly", "yearly"] as const;
const COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];
const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export default function Reports() {
  const { toast } = useToast();
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly" | "yearly">("monthly");
  const [sendOpen, setSendOpen] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [sendTelegram, setSendTelegram] = useState(false);
  const [sending, setSending] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data: pl, isLoading: loadingPL } = useGetProfitLossReport({ period });
  const { data: inv, isLoading: loadingInv } = useGetInventoryReport();

  const handleExcelExport = async () => {
    setExporting(true);
    try {
      const url = `${BASE}/api/export/report/excel?period=${period}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `AlGhani_Report_${period}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast({ title: "✅ Excel exported successfully!" });
    } catch {
      // Fallback: open in new tab
      window.open(`${BASE}/api/export/report/excel?period=${period}`, "_blank");
    } finally {
      setExporting(false);
    }
  };

  const handleSend = async () => {
    setSending(true);
    try {
      const promises = [];
      if (sendEmail) {
        promises.push(fetch(`${BASE}/api/email/send-report`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportType: `${period}-summary` }),
        }).then(r => r.json()));
      }
      if (sendTelegram) {
        promises.push(fetch(`${BASE}/api/telegram/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportType: `${period}-summary` }),
        }).then(r => r.json()));
      }
      await Promise.all(promises);
      toast({ title: "✅ Report sent!", description: `Sent via ${[sendEmail && "Email", sendTelegram && "Telegram"].filter(Boolean).join(" & ")}` });
      setSendOpen(false);
    } catch {
      toast({ title: "Failed to send report", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6 sm:space-y-8">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
              <FileBarChart className="w-5 h-5 sm:w-6 sm:h-6 text-primary" /> Reports & Analytics
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Financial and inventory reports</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className="border-border gap-1.5 h-9"
              onClick={handleExcelExport}
              disabled={exporting}
            >
              <Download className="w-3.5 h-3.5" />
              {exporting ? "Exporting..." : "Export Excel"}
            </Button>
            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90 gap-1.5 h-9"
              onClick={() => setSendOpen(true)}
            >
              <Send className="w-3.5 h-3.5" /> Send Report
            </Button>
          </div>
        </div>

        {/* Period Selector */}
        <div className="flex gap-2 flex-wrap">
          {PERIODS.map(p => (
            <Button
              key={p}
              size="sm"
              onClick={() => setPeriod(p)}
              className={`capitalize h-9 ${period === p ? "bg-primary text-white hover:bg-primary/90" : "border border-border bg-transparent hover:bg-accent"}`}
            >{p}</Button>
          ))}
        </div>

        {/* P&L Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {[
            { label: "Revenue", value: pl?.revenue, color: "text-green-400" },
            { label: "Cost of Goods", value: pl?.costOfGoods, color: "text-red-400" },
            { label: "Gross Profit", value: pl?.grossProfit, color: "text-secondary" },
            { label: "Expenses", value: pl?.expenses, color: "text-primary" },
            { label: "Net Profit", value: pl?.netProfit, color: (pl?.netProfit || 0) >= 0 ? "text-green-400" : "text-red-400" },
          ].map(stat => (
            <Card key={stat.label} className="border-border bg-card">
              <CardContent className="p-3 sm:p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">{stat.label}</p>
                <p className={`text-base sm:text-xl font-bold ${stat.color}`}>
                  Rs. {stat.value?.toLocaleString() || 0}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* P&L Chart */}
        <Card className="border-border bg-card">
          <CardHeader><CardTitle className="text-base sm:text-lg">Profit & Loss Breakdown</CardTitle></CardHeader>
          <CardContent>
            {loadingPL ? (
              <div className="h-48 sm:h-64 flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
            ) : (
              <div className="h-48 sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pl?.breakdown || []} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" stroke="#888" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => `${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))", fontSize: 12 }} />
                    <Bar dataKey="sales" name="Sales" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
                    <Bar dataKey="profit" name="Profit" fill="hsl(var(--secondary))" radius={[4,4,0,0]} />
                    <Bar dataKey="purchases" name="Purchases" fill="hsl(var(--chart-3))" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Inventory Report */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <Card className="border-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Package className="w-5 h-5 text-primary" /> Inventory Valuation
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingInv ? (
                <p className="text-muted-foreground text-sm">Loading...</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center p-3 rounded-lg bg-accent">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Products</p>
                      <p className="text-xl font-bold mt-1">{inv?.totalProducts}</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-accent">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Stock</p>
                      <p className="text-xl font-bold mt-1">{inv?.totalStock?.toLocaleString()}</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-accent">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Value</p>
                      <p className="text-sm font-bold mt-1 text-secondary">Rs. {inv?.totalValue?.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {inv?.categories.map((cat, idx) => (
                      <div key={cat.name} className="flex items-center justify-between py-2 border-b border-border/50">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                          <span className="text-sm font-medium truncate">{cat.name}</span>
                          <span className="text-xs text-muted-foreground">({cat.count})</span>
                        </div>
                        <span className="text-sm font-semibold text-secondary flex-shrink-0">Rs. {cat.value?.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader><CardTitle className="text-base sm:text-lg">Inventory by Category</CardTitle></CardHeader>
            <CardContent>
              {loadingInv ? <p className="text-muted-foreground text-sm">Loading...</p> : (
                <div className="h-48 sm:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={inv?.categories || []}
                        cx="50%" cy="50%"
                        outerRadius={80}
                        dataKey="value"
                        nameKey="name"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                        fontSize={10}
                      >
                        {inv?.categories.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))", fontSize: 12 }}
                        formatter={(v) => [`Rs. ${Number(v).toLocaleString()}`, "Value"]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Send Report Dialog */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="bg-card border-border w-[95vw] max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Send className="w-4 h-4" /> Send Report</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Send <span className="text-foreground font-medium capitalize">{period}</span> report via:
            </p>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-border hover:bg-accent transition-colors">
                <Checkbox checked={sendEmail} onCheckedChange={v => setSendEmail(!!v)} />
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-medium">Email</span>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-border hover:bg-accent transition-colors">
                <Checkbox checked={sendTelegram} onCheckedChange={v => setSendTelegram(!!v)} />
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-sky-400" />
                  <span className="text-sm font-medium">Telegram</span>
                </div>
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Configure email & Telegram credentials in Settings page.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSendOpen(false)} className="border-border h-11 sm:h-9">Cancel</Button>
            <Button
              onClick={handleSend}
              disabled={(!sendEmail && !sendTelegram) || sending}
              className="bg-primary hover:bg-primary/90 h-11 sm:h-9 gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              {sending ? "Sending..." : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
