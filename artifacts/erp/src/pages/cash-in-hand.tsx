import { useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { DateRangeSelector, dateRangeToParams, type DateRangeValue } from "@/components/date-range-selector";
import Confirm from "@/components/ui/confirm";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Wallet, Plus, Search, Trash2 } from "lucide-react";
import { format } from "date-fns";

type CashBucketRow = {
  bucket: string;
  cashIn: number;
  cashOut: number;
  netChange: number;
  closingBalance: number;
  transactionCount: number;
};

type CashReport = {
  range: string;
  bucket: "daily" | "weekly" | "monthly";
  openingBalance: number;
  closingBalance: number;
  totalIn: number;
  totalOut: number;
  netChange: number;
  transactionCount: number;
  buckets: CashBucketRow[];
};

type CashMovement = {
  id: string;
  date: string;
  source: "customer_payment" | "supplier_payment" | "expense" | "manual";
  direction: "in" | "out";
  amount: number;
  partyName: string | null;
  description: string;
};

const SOURCE_LABEL: Record<CashMovement["source"], string> = {
  customer_payment: "Customer Payment",
  supplier_payment: "Supplier Payment",
  expense: "Expense",
  manual: "Manual Entry",
};

const QUICK_PERIODS: { key: "today" | "thisweek" | "thismonth"; label: string; bucket: "daily" | "weekly" | "monthly" }[] = [
  { key: "today", label: "Daily", bucket: "daily" },
  { key: "thisweek", label: "Weekly", bucket: "weekly" },
  { key: "thismonth", label: "Monthly", bucket: "monthly" },
];

type EntryForm = { entryDate: string; type: "opening_balance" | "old_entry" | "adjustment"; direction: "in" | "out"; amount: string; note: string };
const emptyEntry: EntryForm = { entryDate: new Date().toISOString().split("T")[0], type: "old_entry", direction: "in", amount: "", note: "" };

export default function CashInHand() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [quickPeriod, setQuickPeriod] = useState<"today" | "thisweek" | "thismonth" | "custom">("thismonth");
  const [range, setRange] = useState<DateRangeValue>({ preset: "thismonth" });
  const [search, setSearch] = useState("");
  const [entryOpen, setEntryOpen] = useState(false);
  const [form, setForm] = useState<EntryForm>(emptyEntry);

  const bucket = quickPeriod === "custom" ? "daily" : QUICK_PERIODS.find((p) => p.key === quickPeriod)?.bucket ?? "daily";
  const params = dateRangeToParams(range);
  params.set("bucket", bucket);

  const { data: report, isLoading, error } = useQuery({
    queryKey: ["cash-report", params.toString()],
    queryFn: () => apiGet<CashReport>(`/api/cash/report?${params.toString()}`),
  });

  const historyParams = dateRangeToParams(range);
  if (search.trim()) historyParams.set("search", search.trim());
  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["cash-history", historyParams.toString()],
    queryFn: () => apiGet<{ data: CashMovement[] }>(`/api/cash/history?${historyParams.toString()}`),
  });

  const chartData = useMemo(
    () => (report?.buckets ?? []).map((b) => ({ label: b.bucket, "Cash In": b.cashIn, "Cash Out": b.cashOut, "Balance": b.closingBalance })),
    [report],
  );

  function selectQuickPeriod(key: "today" | "thisweek" | "thismonth") {
    setQuickPeriod(key);
    setRange({ preset: key, from: undefined, to: undefined });
  }

  function selectCustomRange(value: DateRangeValue) {
    setQuickPeriod("custom");
    setRange(value);
  }

  async function handleAddEntry() {
    try {
      await apiPost("/api/cash/entries", {
        entryDate: form.entryDate,
        type: form.type,
        direction: form.direction,
        amount: parseFloat(form.amount),
        note: form.note || undefined,
      });
      qc.invalidateQueries({ queryKey: ["cash-report"] });
      qc.invalidateQueries({ queryKey: ["cash-history"] });
      setEntryOpen(false);
      setForm(emptyEntry);
      toast({ title: "Cash entry added" });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Failed to add entry", variant: "destructive" });
    }
  }

  async function handleDeleteEntry(id: string) {
    const numericId = id.split(":")[1];
    try {
      await apiDelete(`/api/cash/entries/${numericId}`);
      qc.invalidateQueries({ queryKey: ["cash-report"] });
      qc.invalidateQueries({ queryKey: ["cash-history"] });
      toast({ title: "Entry deleted" });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Failed to delete entry", variant: "destructive" });
    }
  }

  const summaryCards = [
    { label: "Opening Balance", value: report?.openingBalance ?? 0 },
    { label: "Cash In", value: report?.totalIn ?? 0, highlight: true },
    { label: "Cash Out", value: report?.totalOut ?? 0, negative: true },
    { label: "Closing Balance", value: report?.closingBalance ?? 0, highlight: (report?.closingBalance ?? 0) >= 0 },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Wallet className="w-6 h-6 text-primary" /> Cash in Hand
            </h1>
            <p className="text-sm text-muted-foreground">Daily, weekly, monthly and custom-range cash tracking — connected to month closing.</p>
          </div>
          <Button onClick={() => setEntryOpen(true)} className="gap-2"><Plus className="w-4 h-4" /> Add Old / Manual Entry</Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={quickPeriod === "custom" ? undefined : quickPeriod} onValueChange={(v) => selectQuickPeriod(v as any)}>
            <TabsList>
              {QUICK_PERIODS.map((p) => (
                <TabsTrigger key={p.key} value={p.key}>{p.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <DateRangeSelector value={range} onChange={selectCustomRange} customOnly hideCustomTrigger={false} />
        </div>

        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">Unable to load cash report. Please try again.</div>}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {summaryCards.map((s) => (
            <Card key={s.label} className="border-border bg-card">
              <CardContent className="p-3 sm:p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">{s.label}</p>
                <p className={`text-base sm:text-xl font-bold ${s.negative ? "text-red-400" : s.highlight ? "text-green-400" : "text-secondary"}`}>
                  Rs. {Number(s.value).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Running Balance ({bucket})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">Loading cash data...</div>
            ) : chartData.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">No cash movements in this range.</div>
            ) : (
              <div className="h-56 sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" stroke="#888" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${v >= 1000 || v <= -1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))", fontSize: 12 }} />
                    <Bar dataKey="Cash In" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Cash Out" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Balance by {bucket === "daily" ? "day" : bucket === "weekly" ? "week" : "month"}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground uppercase text-xs tracking-wider">
                    <th className="px-4 py-3 text-left">Period</th>
                    <th className="px-4 py-3 text-right">Cash In</th>
                    <th className="px-4 py-3 text-right">Cash Out</th>
                    <th className="px-4 py-3 text-right">Net</th>
                    <th className="px-4 py-3 text-right">Balance</th>
                    <th className="px-4 py-3 text-right">Transactions</th>
                  </tr>
                </thead>
                <tbody>
                  {(report?.buckets ?? []).length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No data for this range</td></tr>
                  ) : (
                    (report?.buckets ?? []).map((b) => (
                      <tr key={b.bucket} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                        <td className="px-4 py-3 font-medium">{b.bucket}</td>
                        <td className="px-4 py-3 text-right text-green-400">Rs. {b.cashIn.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-red-400">Rs. {b.cashOut.toLocaleString()}</td>
                        <td className={`px-4 py-3 text-right ${b.netChange >= 0 ? "text-green-400" : "text-red-400"}`}>Rs. {b.netChange.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-semibold">Rs. {b.closingBalance.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{b.transactionCount}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base sm:text-lg">History &amp; Search</CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by party, note, category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 bg-background/50 border-border"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground uppercase text-xs tracking-wider">
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Source</th>
                    <th className="px-4 py-3 text-left">Party / Note</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {historyLoading ? (
                    <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
                  ) : (history?.data ?? []).length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No matching transactions</td></tr>
                  ) : (
                    (history?.data ?? []).map((m) => (
                      <tr key={m.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{format(new Date(m.date), "d MMM yyyy")}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 rounded text-xs bg-accent text-muted-foreground">{SOURCE_LABEL[m.source]}</span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground max-w-[280px] truncate">{m.partyName ? `${m.partyName} — ${m.description}` : m.description}</td>
                        <td className={`px-4 py-3 text-right font-semibold ${m.direction === "in" ? "text-green-400" : "text-red-400"}`}>
                          {m.direction === "in" ? "+" : "-"}Rs. {m.amount.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {m.source === "manual" && (
                            <Confirm
                              title="Delete this cash entry?"
                              description="This action cannot be undone."
                              onConfirm={() => handleDeleteEntry(m.id)}
                              trigger={<Button size="sm" variant="ghost" className="hover:bg-destructive/20 hover:text-destructive w-8 h-8 p-0"><Trash2 className="w-4 h-4" /></Button>}
                            />
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={entryOpen} onOpenChange={setEntryOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader><DialogTitle>Add Old / Manual Cash Entry</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <p className="text-xs text-muted-foreground">
              Use this for historical cash data from before the system was set up (opening balance) or any
              cash movement that wasn't recorded through Sales, Payments, or Expenses.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as EntryForm["type"] }))}>
                  <SelectTrigger className="bg-background/50 border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="opening_balance">Opening Balance</SelectItem>
                    <SelectItem value="old_entry">Old Entry</SelectItem>
                    <SelectItem value="adjustment">Adjustment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Direction</Label>
                <Select value={form.direction} onValueChange={(v) => setForm((f) => ({ ...f, direction: v as EntryForm["direction"] }))}>
                  <SelectTrigger className="bg-background/50 border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in">Cash In</SelectItem>
                    <SelectItem value="out">Cash Out</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Amount (Rs.) *</Label>
                <Input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="bg-background/50 border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Date *</Label>
                <Input type="date" value={form.entryDate} onChange={(e) => setForm((f) => ({ ...f, entryDate: e.target.value }))} className="bg-background/50 border-border" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Note</Label>
              <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className="bg-background/50 border-border" placeholder="e.g. Cash balance carried from register before AlghaniCMS" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEntryOpen(false)} className="border-border">Cancel</Button>
            <Button onClick={handleAddEntry} disabled={!form.amount || !form.entryDate}>Add Entry</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
