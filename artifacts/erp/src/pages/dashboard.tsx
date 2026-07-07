import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGetDashboardSummary, useGetSalesChart, useGetRecentActivity, useGetTopProducts, useGetLowStockAlerts } from "@workspace/api-client-react";
import { Activity, CreditCard, DollarSign, Package, AlertTriangle, Users, ArrowUpRight, ArrowDownRight, ShoppingCart } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: chartData } = useGetSalesChart({ months: 6 });
  const { data: activity } = useGetRecentActivity();
  const { data: topProducts } = useGetTopProducts();
  const { data: lowStock } = useGetLowStockAlerts();

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Command Center</h1>
          <p className="text-muted-foreground mt-1">Real-time enterprise overview.</p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title="Total Revenue" value={`Rs. ${summary?.totalRevenue?.toLocaleString() || 0}`} icon={DollarSign} trend="+12.5%" />
          <KpiCard title="Net Profit" value={`Rs. ${summary?.netProfit?.toLocaleString() || 0}`} icon={Activity} trend="+4.2%" trendDown={false} />
          <KpiCard title="Today's Sales" value={`Rs. ${summary?.todaySales?.toLocaleString() || 0}`} icon={CreditCard} />
          <KpiCard title="Total Customers" value={summary?.totalCustomers?.toLocaleString() || 0} icon={Users} />
          <KpiCard title="Total Products" value={summary?.totalProducts?.toLocaleString() || 0} icon={Package} />
          <KpiCard title="Pending Orders" value={summary?.pendingOrders?.toLocaleString() || 0} icon={ShoppingCart} highlight />
          <KpiCard title="Low Stock Alerts" value={summary?.lowStockCount?.toLocaleString() || 0} icon={AlertTriangle} alert />
          <KpiCard title="Total Expenses" value={`Rs. ${summary?.totalExpenses?.toLocaleString() || 0}`} icon={ArrowDownRight} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Chart */}
          <Card className="lg:col-span-2 border-border bg-card">
            <CardHeader>
              <CardTitle>Revenue & Profit Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                {chartData && (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="label" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `Rs.${value/1000}k`} />
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                        itemStyle={{ color: 'hsl(var(--foreground))' }}
                      />
                      <Area type="monotone" dataKey="sales" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorSales)" strokeWidth={2} />
                      <Area type="monotone" dataKey="profit" stroke="hsl(var(--secondary))" fillOpacity={1} fill="url(#colorProfit)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle>System Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {activity?.slice(0, 5).map((item) => (
                  <div key={item.id} className="flex gap-4">
                    <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${item.type === 'sale' ? 'bg-primary shadow-[0_0_5px_rgba(220,38,38,0.5)]' : item.type === 'expense' ? 'bg-destructive' : 'bg-secondary'}`} />
                    <div className="space-y-1 flex-1">
                      <p className="text-sm font-medium leading-none">{item.description}</p>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleDateString()}</p>
                        {item.amount && <span className="text-xs font-medium">Rs. {item.amount.toLocaleString()}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle>Top Performing Products</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topProducts?.map((product, i) => (
                  <div key={product.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-background/50">
                    <div className="flex items-center gap-3">
                      <div className="w-6 text-center font-bold text-muted-foreground">{i + 1}</div>
                      <div>
                        <div className="font-medium text-sm">{product.name}</div>
                        <div className="text-xs text-muted-foreground">{product.sku}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-sm">Rs. {product.revenue.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">{product.totalSold} units</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/30 bg-card">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Critical Stock Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {lowStock?.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border border-destructive/20 bg-destructive/5">
                    <div>
                      <div className="font-medium text-sm">{item.name}</div>
                      <div className="text-xs text-muted-foreground">{item.sku}</div>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      <div className="text-sm">
                        <span className="text-destructive font-bold">{item.currentStock}</span>
                        <span className="text-muted-foreground"> / {item.minStock}</span>
                      </div>
                      <Badge variant="destructive">Refill</Badge>
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

function KpiCard({ title, value, icon: Icon, trend, trendDown, highlight, alert }: any) {
  return (
    <Card className={`border-border bg-card ${highlight ? 'border-primary/50 shadow-[0_0_15px_rgba(220,38,38,0.1)]' : ''} ${alert ? 'border-destructive/50 shadow-[0_0_15px_rgba(220,38,38,0.1)]' : ''}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</CardTitle>
        <Icon className={`w-4 h-4 ${alert ? 'text-destructive' : highlight ? 'text-primary' : 'text-muted-foreground'}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${highlight ? 'text-primary' : ''} ${alert ? 'text-destructive' : ''}`}>{value}</div>
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
