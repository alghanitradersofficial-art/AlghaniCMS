import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

export default function MonthsPage() {
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const qc = useQueryClient();

  const { data: closures } = useQuery({ queryKey: ["months-closures"], queryFn: () => apiGet(`/api/months`) });

  async function handleClose() {
    await apiPost(`/api/months/close`, { year, month });
    qc.invalidateQueries(["months-closures"]);
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Month Closing</h1>
          <div className="flex items-center gap-2">
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-md border px-3 py-2">
              {Array.from({ length: 5 }).map((_, i) => {
                const y = new Date().getFullYear() - i;
                return <option key={y} value={y}>{y}</option>;
              })}
            </select>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="rounded-md border px-3 py-2">
              {Array.from({ length: 12 }).map((_, i) => <option key={i+1} value={i+1}>{i+1}</option>)}
            </select>
            <Button onClick={handleClose}>Close Month</Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Closures</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {closures?.data?.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="font-semibold">{c.year}-{String(c.month).padStart(2, '0')}</div>
                    <div className="text-sm text-muted-foreground">Created: {format(new Date(c.created_at), 'd MMM yyyy HH:mm')}</div>
                  </div>
                  <div className="text-right">
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
