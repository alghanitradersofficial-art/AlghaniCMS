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
      <div className="space-y-5 sm:space-y-8">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold tracking-tight">Command Center</h1>
            <p className="text-muted-foreground mt-0.5 sm:mt-1 text-sm">Real-time enterprise overview.</p>
          </div>
          <DateRangeSelector value={range} onChange={setRange} />
        </div>

        {/* Range-aware KPIs */}
        {loadingRangeSummary ? (
          <SectionLoading label="Crunching the numbers" />
        ) : rangeSummary && (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <KpiCard
              title={`Revenue (${range.preset === "all" ? "All Time" : range.preset})`}
              value={`Rs. ${rangeSummary.totalRevenue.toLocaleString()}`}
              icon={DollarSign} highlight
            />
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
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <KpiCard title="Total Products" value={summary.totalProducts?.toLocaleString() || "0"} icon={Activity} />
            <KpiCard title="Low Stock Items" value={lowStock?.length?.toString() || "0"} icon={AlertTriangle} alert={!!lowStock?.length} />
            <KpiCard title="Active Customers" value={summary.totalCustomers?.toLocaleString() || "0"} icon={Users} />
            <KpiCard title="Active Suppliers" value={summary.totalSuppliers?.toLocaleString() || "0"} icon={Truck} />
          </div>
        )}

        {/* Charts row */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
          {/* Revenue area chart */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm sm:text-base font-semibold">Revenue Trend (6 months)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-36 sm:h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData || []} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" stroke="#888" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => `${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))", fontSize: 12 }} />
                    <Area type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--primary))" fill="url(#revGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Top Products */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm sm:text-base font-semibold">Top Performing Products</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {topProducts?.slice(0, 5).map((item: any, idx: number) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-4 flex-shrink-0">#{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.name}</div>
                      <div className="text-xs text-muted-foreground">{item.totalSold} units sold</div>
                    </div>
                    <div className="text-sm font-bold text-secondary flex-shrink-0">
                      Rs. {item.revenue?.toLocaleString()}
                    </div>
                  </div>
                ))}
                {(!topProducts || topProducts.length === 0) && (
                  <div className="text-center py-6 text-muted-foreground text-sm">No sales data yet.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Activity + Low Stock row */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
          {/* Recent Activity */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm sm:text-base font-semibold">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingActivity ? (
                <SectionLoading label="Loading activity" />
              ) : (
                <div className="space-y-2">
                  {activity?.map(item => (
                    <div key={item.id} className="flex items-center gap-3 py-1.5 border-b border-border/40 last:border-0">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${item.direction === "credit" ? "bg-emerald-500" : "bg-red-500"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{item.description}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.createdAt ? format(new Date(item.createdAt), "d MMM, h:mm a") : "—"}
                        </div>
                      </div>
                      <span className={`text-xs font-bold flex-shrink-0 ${item.direction === "credit" ? "text-emerald-500" : "text-red-500"}`}>
                        {item.direction === "credit" ? "+" : "-"}Rs. {item.amount?.toLocaleString()}
                      </span>
                    </div>
                  ))}
                  {(!activity || activity.length === 0) && (
                    <div className="text-center py-6 text-muted-foreground text-sm">No activity in this period.</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Low Stock Alerts */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive" /> Low Stock Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {lowStock?.map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between p-2.5 rounded-lg border border-destructive/20 bg-destructive/5">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">{item.name}</div>
                      <div className="text-xs text-muted-foreground">{item.sku}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <div className="text-sm text-right">
                        <span className="text-destructive font-bold">{item.currentStock}</span>
                        <span className="text-muted-foreground"> / {item.minStock}</span>
                      </div>
                      <Badge variant="destructive" className="text-xs">Refill</Badge>
                    </div>
                  </div>
                ))}
                {(!lowStock || lowStock.length === 0) && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Inventory levels optimal.
                  </div>
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
  title: string; value: string; icon: any; trend?: string; trendDown?: boolean; highlight?: boolean; alert?: boolean;
}) {
  return (
    <Card className={`border-border bg-card ${highlight ? "border-primary/50 shadow-[0_0_15px_rgba(220,38,38,0.1)]" : ""} ${alert ? "border-destructive/50 shadow-[0_0_15px_rgba(220,38,38,0.1)]" : ""}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-1.5 sm:pb-2 space-y-0 p-3 sm:p-6">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider leading-tight">{title}</CardTitle>
        <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 ${alert ? "text-destructive" : highlight ? "text-primary" : "text-muted-foreground"}`} />
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0">
        <div className={`text-lg sm:text-2xl font-bold ${highlight ? "text-primary" : ""} ${alert ? "text-destructive" : ""}`}>{value}</div>
        {trend && (
          <p className="text-xs mt-1 flex items-center gap-1">
            <span className={trendDown ? "text-destructive" : "text-emerald-500"}>
              {trendDown ? <ArrowDownRight className="w-3 h-3 inline" /> : <ArrowUpRight className="w-3 h-3 inline" />}
              {trend}
            </span>
            <span className="text-muted-foreground">vs last month</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
