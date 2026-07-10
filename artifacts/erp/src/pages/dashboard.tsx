import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGetDashboardSummary, useGetSalesChart, useGetTopProducts, useGetLowStockAlerts } from "@workspace/api-client-react";
import { Activity, DollarSign, AlertTriangle, Users, ArrowUpRight, ArrowDownRight, ShoppingCart, Truck, Warehouse } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DateRangeSelector, dateRangeToParams, type DateRangeValue } from "@/components/date-range-selector";
import { SectionLoading } from "@/components/loading-state";
import { apiGet } from "@/lib/api";
import { format } from "date-fns";

type RangeSummary = {
  range: string; totalRevenue: number; totalPurchases: number; totalExpenses: number; totalSalaries: number;
  netProfit: number; salesCount: number; totalProducts: number; totalCustomers: number; totalSuppliers: number; inventoryValue: number;
};

type RecentActivityItem = {
  id: number; type: string; description: string; amount: number; direction: string; createdAt: string;
};

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: chartData } = useGetSalesChart({ months: 6 });
  const { data: topProducts } = useGetTopProducts();
  const { data: lowStock } = useGetLowStockAlerts();

  const [range, setRange] = useState<DateRangeValue>({ preset: "all" });
  const params = dateRangeToParams(range);

  const { data: rangeSummary, isLoading: loadingRangeSummary } = useQuery({
    queryKey: ["dashboard-summary-range", params.toString()],
    queryFn: () => apiGet<RangeSummary>(`/api/dashboard/summary-range?${params.toString()}`),
  });

  const { data: activity, isLoading: loadingActivity } = useQuery({
    queryKey: ["dashboard-activity-range", params.toString()],
    queryFn: () => apiGet<RecentActivityItem[]>(`/api/dashboard/recent-activity-range?${params.toString()}&limit=8`),
  });

  return (
    <Layout>
      <div className="space-y-6 sm:space-y-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Command Center</h1>
            <p className="mt-2 max-w-2xl text-sm sm:text-base text-muted-foreground">
              Premium insights for sales, inventory and financial performance.
            </p>
          </div>

          <div className="w-full max-w-sm">
            <DateRangeSelector value={range} onChange={setRange} />
          </div>
        </div>

        {/* Range-aware KPIs */}
        {loadingRangeSummary ? (
          <SectionLoading label="Crunching the numbers" />
        ) : rangeSummary && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiCard title={`Revenue (${range.preset === "all" ? "All Time" : range.preset})`} value={`Rs. ${rangeSummary.totalRevenue.toLocaleString()}`} icon={DollarSign} highlight />
            <KpiCard title="Net Profit" value={`Rs. ${rangeSummary.netProfit.toLocaleString()}`} icon={Activity} />
            <KpiCard title="Purchases" value={`Rs. ${rangeSummary.totalPurchases.toLocaleString()}`} icon={Truck} />
            <KpiCard title="Expenses" value={`Rs. ${rangeSummary.totalExpenses.toLocaleString()}`} icon={ArrowDownRight} />
            <KpiCard title="Sales Count" value={rangeSummary.salesCount.toLocaleString()} icon={ShoppingCart} />
            <KpiCard title="Total Customers" value={rangeSummary.totalCustomers.toLocaleString()} icon={Users} />
            <KpiCard title="Total Suppliers" value={rangeSummary.totalSuppliers.toLocaleString()} icon={Truck} />
            <KpiCard title="Inventory Value" value={`Rs. ${rangeSummary.inventoryValue.toLocaleString()}`} icon={Warehouse} />
          </div>
        )}

        {/* Lifetime snapshot KPIs */}
        {!loadingSummary && summary && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiCard title="Total Products" value={summary.totalProducts?.toLocaleString() || "0"} icon={Activity} />
            <KpiCard title="Low Stock Items" value={lowStock?.length?.toString() || "0"} icon={AlertTriangle} alert={!!lowStock?.length} />
            <KpiCard title="Active Customers" value={summary.totalCustomers?.toLocaleString() || "0"} icon={Users} />
            <KpiCard title="Active Suppliers" value={summary.totalSuppliers?.toLocaleString() || "0"} icon={Truck} />
          </div>
        )}

        {/* Charts row */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card className="border-border bg-card shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Revenue Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-56 sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData || []} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(value) => (value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value)} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))", fontSize: 12 }} />
                    <Area type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--primary))" fill="url(#revGrad)" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Top Performing Products</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topProducts?.slice(0, 5).map((item: any, idx: number) => (
                  <div key={item.id} className="flex items-center gap-4 rounded-3xl border border-border/70 bg-background/70 p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary font-semibold">{idx + 1}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">{item.name}</div>
                      <div className="text-xs text-muted-foreground">{item.totalSold} units sold</div>
                    </div>
                    <div className="text-sm font-semibold text-secondary">Rs. {item.revenue?.toLocaleString()}</div>
                  </div>
                ))}
                {(!topProducts || topProducts.length === 0) && (
                  <div className="text-center py-8 text-muted-foreground">No sales data available.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Activity + Low Stock row */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card className="border-border bg-card shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingActivity ? (
                <SectionLoading label="Loading activity" />
              ) : (
                <div className="space-y-3">
                  {activity?.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-4 rounded-3xl border border-border/70 bg-background/70 p-4">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{item.description}</div>
                        <div className="text-xs text-muted-foreground">{item.createdAt ? format(new Date(item.createdAt), "d MMM, h:mm a") : "—"}</div>
                      </div>
                      <div className={`rounded-2xl px-3 py-1 text-xs font-semibold ${item.direction === "credit" ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
                        {item.direction === "credit" ? "+" : "-"} Rs. {item.amount.toLocaleString()}
                      </div>
                    </div>
                  ))}
                  {(!activity || activity.length === 0) && (
                    <div className="text-center py-10 text-muted-foreground">No activity in this period.</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border bg-card shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" /> Low Stock Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {lowStock?.map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between gap-4 rounded-3xl border border-destructive/20 bg-destructive/5 p-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{item.name}</div>
                      <div className="text-xs text-muted-foreground">{item.sku}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right text-sm">
                        <div className="font-semibold text-destructive">{item.currentStock}</div>
                        <div className="text-xs text-muted-foreground">Min {item.minStock}</div>
                      </div>
                      <Badge variant="destructive" className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.18em]">
                        Refill
                      </Badge>
                    </div>
                  </div>
                ))}
                {(!lowStock || lowStock.length === 0) && (
                  <div className="text-center py-10 text-muted-foreground">Inventory levels optimal.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

function KpiCard({ title, value, icon: Icon, trend, trendDown, highlight, alert }: {
  title: string;
  value: string;
  icon: any;
  trend?: string;
  trendDown?: boolean;
  highlight?: boolean;
  alert?: boolean;
}) {
  return (
    <Card className={`border-border bg-card ${highlight ? "border-primary/50 shadow-[0_0_20px_rgba(56,189,248,0.1)]" : ""} ${alert ? "border-destructive/50 shadow-[0_0_20px_rgba(248,113,113,0.1)]" : ""}`}>
      <CardHeader className="flex items-center justify-between gap-3 p-4 sm:p-5">
        <div>
          <CardTitle className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">{title}</CardTitle>
        </div>
        <Icon className={`h-4 w-4 ${alert ? "text-destructive" : highlight ? "text-primary" : "text-muted-foreground"}`} />
      </CardHeader>
      <CardContent className="p-4 sm:p-5 pt-0">
        <div className={`text-xl sm:text-2xl font-semibold ${highlight ? "text-primary" : alert ? "text-destructive" : "text-foreground"}`}>{value}</div>
        {trend && (
          <p className="text-xs mt-2 flex items-center gap-1 text-muted-foreground">
            <span className={trendDown ? "text-destructive" : "text-emerald-500"}>
              {trendDown ? <ArrowDownRight className="inline h-3 w-3" /> : <ArrowUpRight className="inline h-3 w-3" />}
              {trend}
            </span>
            <span>vs last month</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
