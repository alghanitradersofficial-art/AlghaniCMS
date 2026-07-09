import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionLoading } from "@/components/loading-state";
import { DateRangeSelector, dateRangeToParams, type DateRangeValue } from "@/components/date-range-selector";
import { apiGet } from "@/lib/api";
import { BookText } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type LedgerEntry = {
  id: number; date: string; type: string; partyType: string; partyName: string | null;
  amount: number; direction: string; note: string | null;
};

type LedgerResponse = { data: LedgerEntry[]; total: number; totalCredit: number; totalDebit: number; netBalance: number };

const TYPES = ["sale", "purchase", "expense", "salary", "supplier_payment", "customer_payment", "staff_advance", "adjustment"];

export default function LedgerPage() {
  const [range, setRange] = useState<DateRangeValue>({ preset: "month" });
  const [type, setType] = useState<string>("all");
  const [partyType, setPartyType] = useState<string>("all");

  const params = dateRangeToParams(range);
  if (type !== "all") params.set("type", type);
  if (partyType !== "all") params.set("partyType", partyType);
  params.set("limit", "100");

  const { data, isLoading } = useQuery({
    queryKey: ["general-ledger", params.toString()],
    queryFn: () => apiGet<LedgerResponse>(`/api/general-ledger?${params.toString()}`),
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><BookText className="w-6 h-6 text-primary" /> Ledger</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <DateRangeSelector value={range} onChange={setRange} />
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-44 bg-card border-border h-9 text-xs"><SelectValue placeholder="All Types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t.replace("_", " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={partyType} onValueChange={setPartyType}>
            <SelectTrigger className="w-40 bg-card border-border h-9 text-xs"><SelectValue placeholder="All Parties" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Parties</SelectItem>
              <SelectItem value="customer">Customer</SelectItem>
              <SelectItem value="supplier">Supplier</SelectItem>
              <SelectItem value="staff">Staff</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {data && (
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-border bg-card"><CardContent className="p-4"><p className="text-xs text-muted-foreground uppercase">Total In</p><p className="text-xl font-bold text-emerald-500">Rs {data.totalCredit.toLocaleString()}</p></CardContent></Card>
            <Card className="border-border bg-card"><CardContent className="p-4"><p className="text-xs text-muted-foreground uppercase">Total Out</p><p className="text-xl font-bold text-red-500">Rs {data.totalDebit.toLocaleString()}</p></CardContent></Card>
            <Card className="border-border bg-card"><CardContent className="p-4"><p className="text-xs text-muted-foreground uppercase">Net</p><p className={cn("text-xl font-bold", data.netBalance >= 0 ? "text-emerald-500" : "text-red-500")}>Rs {data.netBalance.toLocaleString()}</p></CardContent></Card>
          </div>
        )}

        <Card className="border-border bg-card">
          <CardContent className="p-0">
            {isLoading ? <SectionLoading label="Loading ledger" /> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground uppercase text-xs tracking-wider">
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left">Party</th>
                    <th className="px-4 py-3 text-left">Note</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.data.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">No transactions in this range</td></tr>
                  ) : data?.data.map((e) => (
                    <tr key={e.id} className="border-b border-border/50 hover:bg-accent/30">
                      <td className="px-4 py-3 text-muted-foreground">{format(new Date(e.date), "d MMM yyyy")}</td>
                      <td className="px-4 py-3"><Badge variant="outline" className="capitalize">{e.type.replace("_", " ")}</Badge></td>
                      <td className="px-4 py-3 text-muted-foreground">{e.partyName || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{e.note || "—"}</td>
                      <td className={cn("px-4 py-3 text-right font-medium", e.direction === "credit" ? "text-emerald-500" : "text-red-500")}>
                        {e.direction === "credit" ? "+" : "-"}Rs {e.amount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
