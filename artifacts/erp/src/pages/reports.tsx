import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useGetProfitLossReport, useGetInventoryReport } from "@workspace/api-client-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { FileBarChart, TrendingUp, TrendingDown, Package } from "lucide-react";

const PERIODS = ["daily", "weekly", "monthly", "yearly"] as const;
const COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

export default function Reports() {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly" | "yearly">("monthly");

  const { data: pl, isLoading: loadingPL } = useGetProfitLossReport({ period });
  const { data: inv, isLoading: loadingInv } = useGetInventoryReport();

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><FileBarChart className="w-6 h-6 text-primary" /> Reports & Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">Financial and inventory reports</p>
        </div>

        {/* Period Selector */}
        <div className="flex gap-2">
          {PERIODS.map(p => (
            <Button key={p} size="sm" onClick={() => setPeriod(p)}
              className={period === p ? "bg-primary text-white hover:bg-primary/90 capitalize" : "border border-border bg-transparent hover:bg-accent capitalize"}
            >{p}</Button>
          ))}
        </div>

        {/* P&L Summary */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {[
            { label: "Revenue", value: pl?.revenue, icon: TrendingUp, color: "text-green-400" },
            { label: "Cost of Goods", value: pl?.costOfGoods, icon: TrendingDown, color: "text-red-400" },
            { label: "Gross Profit", value: pl?.grossProfit, icon: TrendingUp, color: "text-secondary" },
            { label: "Expenses", value: pl?.expenses, icon: TrendingDown, color: "text-primary" },
            { label: "Net Profit", value: pl?.netProfit, icon: TrendingUp, color: (pl?.netProfit || 0) >= 0 ? "text-green-400" : "text-red-400" },
          ].map(stat => (
            <Card key={stat.label} className="border-border bg-card">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{stat.label}</p>
                <p className={`text-xl font-bold ${stat.color}`}>Rs. {stat.value?.toLocaleString() || 0}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* P&L Chart */}
        <Card className="border-border bg-card">
          <CardHeader><CardTitle>Profit & Loss Breakdown</CardTitle></CardHeader>
          <CardContent>
            {loadingPL ? <div className="h-64 flex items-center justify-center text-muted-foreground">Loading...</div> : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pl?.breakdown || []} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" stroke="#888" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888" fontSize={11} tickLine={false} axisLine={false} tickFormatter={v => `Rs.${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }} />
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Package className="w-5 h-5 text-primary" /> Inventory Valuation</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingInv ? <p className="text-muted-foreground">Loading...</p> : (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-3 rounded-lg bg-accent">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Products</p>
                      <p className="text-2xl font-bold mt-1">{inv?.totalProducts}</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-accent">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Stock</p>
                      <p className="text-2xl font-bold mt-1">{inv?.totalStock?.toLocaleString()}</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-accent">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Value</p>
                      <p className="text-lg font-bold mt-1 text-secondary">Rs. {inv?.totalValue?.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {inv?.categories.map((cat, idx) => (
                      <div key={cat.name} className="flex items-center justify-between py-2 border-b border-border/50">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                          <span className="text-sm font-medium">{cat.name}</span>
                          <span className="text-xs text-muted-foreground">({cat.count} items)</span>
                        </div>
                        <span className="text-sm font-semibold text-secondary">Rs. {cat.value?.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader><CardTitle>Inventory by Category</CardTitle></CardHeader>
            <CardContent>
              {loadingInv ? <p className="text-muted-foreground">Loading...</p> : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={inv?.categories || []} cx="50%" cy="50%" outerRadius={90} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                        {inv?.categories.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }} formatter={(v) => [`Rs. ${Number(v).toLocaleString()}`, "Value"]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
