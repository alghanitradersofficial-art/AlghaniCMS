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
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Wallet, Plus, Banknote, Trash2 } from "lucide-react";
import Confirm from "@/components/ui/confirm";
import { cn } from "@/lib/utils";

type CashEntry = {
  id: number;
  amount: number;
  entryDate: string; // YYYY-MM-DD
  note: string | null;
  createdAt: string;
};

type CashEntriesResponse = {
  data: CashEntry[];
  total: number;
  count: number;
};

type FilterType = "daily" | "weekly" | "monthly" | "custom";

function money(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDay(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric", weekday: "short" });
}

export default function CashInHandPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const today = useMemo(() => new Date(), []);
  const todayStr = toDateStr(today);

  const [filter, setFilter] = useState<FilterType>("daily");
  const [customFrom, setCustomFrom] = useState(todayStr);
  const [customTo, setCustomTo] = useState(todayStr);
  const [addOpen, setAddOpen] = useState(false);

  const range = useMemo(() => {
    if (filter === "daily") return { from: todayStr, to: todayStr };
    if (filter === "weekly") {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { from: toDateStr(start), to: todayStr };
    }
    if (filter === "monthly") {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { from: toDateStr(start), to: toDateStr(end) };
    }
    return { from: customFrom, to: customTo };
  }, [filter, todayStr, today, customFrom, customTo]);

  const entriesQuery = useQuery({
    queryKey: ["cash-entries", range.from, range.to],
    queryFn: () => apiGet<CashEntriesResponse>(`/api/cash-entries?from=${range.from}&to=${range.to}`),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["cash-entries"] });

  const handleDelete = async (entry: CashEntry) => {
    try {
      await apiDelete(`/api/cash-entries/${entry.id}`);
      toast({ title: "Cash entry deleted" });
      invalidate();
    } catch (e: any) {
      toast({ title: "Failed to delete entry", description: e.message, variant: "destructive" });
    }
  };

  const entries = entriesQuery.data?.data ?? [];
  const total = entriesQuery.data?.total ?? 0;

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
              Manual entry only — add today's cash by hand and keep a filterable history.
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)} className="gap-1.5">
            <Plus className="w-4 h-4" /> Add Cash
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Cash ({filter})</CardTitle>
              <Banknote className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{money(total)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Entries</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{entries.length}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Cash History</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {(["daily", "weekly", "monthly", "custom"] as FilterType[]).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={filter === f ? "default" : "outline"}
                  className={cn("capitalize", filter !== f && "border-border")}
                  onClick={() => setFilter(f)}
                >
                  {f}
                </Button>
              ))}
              {filter === "custom" && (
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="h-8 w-[150px] border-border bg-background/50 text-sm"
                  />
                  <span className="text-muted-foreground text-sm">to</span>
                  <Input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="h-8 w-[150px] border-border bg-background/50 text-sm"
                  />
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {entriesQuery.isLoading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading…</div>
            ) : entries.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No cash entries recorded for this period.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{formatDay(e.entryDate)}</TableCell>
                      <TableCell className="text-muted-foreground">{e.note || "—"}</TableCell>
                      <TableCell className="text-right font-semibold">{money(e.amount)}</TableCell>
                      <TableCell className="text-right">
                        <Confirm
                          title="Delete this cash entry?"
                          description="This will permanently remove this manual cash entry."
                          onConfirm={() => handleDelete(e)}
                          trigger={
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <AddCashForm
          onSubmit={async (payload) => {
            try {
              await apiPost("/api/cash-entries", payload);
              toast({ title: "Cash entry added" });
              invalidate();
              setAddOpen(false);
            } catch (e: any) {
              toast({ title: "Failed to add cash entry", description: e.message, variant: "destructive" });
            }
          }}
        />
      </Dialog>
    </Layout>
  );
}

function AddCashForm({ onSubmit }: { onSubmit: (payload: { amount: number; entryDate: string; note?: string }) => void }) {
  const [amount, setAmount] = useState("");
  const [entryDate, setEntryDate] = useState(toDateStr(new Date()));
  const [note, setNote] = useState("");

  return (
    <DialogContent className="bg-card border-border max-w-md">
      <DialogHeader><DialogTitle>Add Cash</DialogTitle></DialogHeader>
      <div className="grid gap-3 py-2">
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Amount *</Label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="bg-background/50 border-border" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Date</Label>
          <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="bg-background/50 border-border" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Note (optional)</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} className="bg-background/50 border-border" />
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={!amount}
          onClick={() => onSubmit({ amount: parseFloat(amount), entryDate, note: note || undefined })}
        >
          Add Cash
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
