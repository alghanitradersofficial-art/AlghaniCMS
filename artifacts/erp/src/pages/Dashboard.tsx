import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGetDashboardSummary, useGetSalesChart, useGetLowStockAlerts, useGetTopProducts, useGetRecentActivity } from "@workspace/api-client-react";
import { Activity, DollarSign, AlertTriangle, Users, ShoppingCart, Truck, Warehouse, TrendingUp, Wallet, Package, SlidersHorizontal, Search as SearchIcon, ShieldAlert, Monitor, Clock3 } from "lucide-react";
import { useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, BarChart, Bar, PieChart, Pie, Cell, Legend } from "recharts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DateRangeSelector, dateRangeToParams, type DateRangeValue } from "@/components/date-range-selector";
import UniversalSearch from "@/components/universal-search";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { SectionLoading } from "@/components/loading-state";
import { apiGet, apiPost } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { Link } from "wouter";

type RangeSummary = {
  range: string;
  label: string;
  totalRevenue: number;
  totalPurchases: number;
  totalExpenses: number;
  grossProfit: number;
  cogs: number;
  netProfit: number;
  salesCount: number;
  totalProducts: number;
  totalCustomers: number;
  totalSuppliers: number;
  inventoryValue: number;
  comparison?: Record<string, number>;
};

export default function Dashboard() {
  const [range, setRange] = useState<DateRangeValue>({ preset: "all" });
  const [customDatesOpen, setCustomDatesOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const currentUser = getUser();
  const canViewSecurityFeed = ["developer", "ceo"].includes((currentUser?.role || "").toLowerCase());
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();

  const monthsFromRange = (r: DateRangeValue) => {
    if (!r) return 6;
    if (r.preset === "all") return 24;
    if (r.preset === "thisyear" || r.preset === "lastyear") return 12;
    if (r.preset === "thismonth" || r.preset === "lastmonth") return 1;
    if (r.preset === "thisweek" || r.preset === "lastweek" || r.preset === "last7days" || r.preset === "today" || r.preset === "yesterday") return 1;
    if (r.preset === "custom" && r.from && r.to) {
      const from = new Date(r.from);
      const to = new Date(r.to);
      const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1;
      return Math.max(1, Math.min(48, months));
    }
    return 6;
  };

  const params = dateRangeToParams(range);
  const { data: chartData } = useGetSalesChart({ months: monthsFromRange(range) });
  const { data: lowStock } = useGetLowStockAlerts();
  const { data: topProducts } = useGetTopProducts();
  const recent = useGetRecentActivity();

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const queryClient = useQueryClient();

  const { data: rangeSummary, isLoading: loadingRangeSummary } = useQuery({
    queryKey: ["dashboard-summary-range", params.toString()],
    queryFn: () => apiGet<RangeSummary>(`/api/dashboard/summary-range?${params.toString()}`),
  });

  const { data: securitySummary, isLoading: loadingSecuritySummary } = useQuery({
    queryKey: ["security-summary"],
    queryFn: () => apiGet<any>("/api/auth/security-summary"),
    enabled: securityOpen,
  });

  const { data: securityFeed, isLoading: loadingSecurityFeed } = useQuery({
    queryKey: ["security-feed"],
    queryFn: () => apiGet<any[]>("/api/auth/security-feed"),
    enabled: securityOpen && canViewSecurityFeed,
  });

  const customRangeLabel =
    range.preset === "custom" && range.from && range.to
      ? `${format(range.from, "d MMM yyyy")} – ${format(range.to, "d MMM yyyy")}`
      : "Custom Range";

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="rounded-2xl border border-border/70 bg-card/90 p-4 sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
                <Activity className="h-3.5 w-3.5" />
                Al Ghani HQ
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Business at a glance</h1>
              <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">
                A simple command center for sales, stock, and daily performance.
              </p>
            </div>
            <div className="flex items-center gap-2 w-full max-w-2xl">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-9">Filters</Button>
                </PopoverTrigger>
                <PopoverContent align="start" sideOffset={8} className="w-auto min-w-[20rem] max-w-[95vw] rounded-2xl border border-border/80 bg-card/90 p-4 shadow-xl">
                  <div className="space-y-3">
                    <div className="text-sm font-semibold">Select range</div>
                    <DateRangeSelector value={range} onChange={setRange} hideCustomTrigger />
                  </div>
                </PopoverContent>
              </Popover>

              <Popover open={customDatesOpen} onOpenChange={setCustomDatesOpen}>
                <PopoverTrigger asChild>
                  <Button variant={range.preset === "custom" ? "default" : "outline"} className="h-9">
                    {range.preset === "custom" ? customRangeLabel : "Custom Dates"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" sideOffset={8} className="w-auto min-w-[24rem] max-w-[95vw] rounded-2xl border border-border/80 bg-card/90 p-4 shadow-xl">
                  <div className="space-y-3">
                    <div className="text-sm font-semibold">Custom Dates</div>
                    <DateRangeSelector
                      value={range}
                      onChange={setRange}
                      customOnly
                      hideCustomTrigger
                      onApply={() => setCustomDatesOpen(false)}
                    />
                  </div>
                </PopoverContent>
              </Popover>

              <Dialog open={securityOpen} onOpenChange={setSecurityOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="h-9">
                    <ShieldAlert className="mr-2 h-4 w-4" />
                    Security
                  </Button>
                </DialogTrigger>
                <DialogContent className="w-[min(95vw,42rem)] max-w-[95vw] max-h-[90vh] overflow-y-auto rounded-2xl border border-border/80 bg-card/90 p-3 shadow-xl sm:p-4">
                  <DialogHeader>
                    <DialogTitle>Security Center</DialogTitle>
                    <DialogDescription>Recent sign-ins and suspicious activity for {currentUser?.name || "your account"}.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm font-semibold">Security Center</div>
                      <p className="text-xs text-muted-foreground">Recent sign-ins and suspicious activity for {currentUser?.name || "your account"}.</p>
                    </div>

                    {loadingSecuritySummary ? (
                      <div className="rounded-xl border border-border/70 bg-background/70 p-3 text-sm text-muted-foreground">Loading security activity…</div>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          className="h-9 w-full justify-center"
                          onClick={async () => {
                            try {
                              const result = await apiPost<{ success: boolean }>("/api/auth/logout-others", {});
                              console.log("Logout others response:", result);
                              if (result?.success) {
                                queryClient.invalidateQueries({ queryKey: ["security-summary"] });
                                setSecurityOpen(false);
                              } else {
                                console.error("Logout others failed: unexpected response", result);
                              }
                            } catch (error) {
                              console.error("Failed to log out other sessions", error);
                            }
                          }}
                        >
                          Logout all other sessions
                        </Button>
                        <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            <Clock3 className="h-3.5 w-3.5" /> Recent Sign-ins
                          </div>
                          {(securitySummary?.recentLogins?.length ? securitySummary.recentLogins : []).length === 0 ? (
                            <div className="text-sm text-muted-foreground">No recent sign-in records yet.</div>
                          ) : (
                            <div className="space-y-2">
                              {(securitySummary?.recentLogins || []).slice(0, 5).map((item: any, index: number) => (
                                <div key={`${item.createdAt}-${index}`} className="rounded-lg border border-border/70 bg-card/70 p-2 text-sm">
                                  <div className="font-medium">{item.reason || "Successful login"}</div>
                                  <div className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()} • {item.ipAddress || "Unknown IP"}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            <AlertTriangle className="h-3.5 w-3.5" /> Suspicious Alerts
                          </div>
                          {(securitySummary?.alerts?.length ? securitySummary.alerts : []).length === 0 ? (
                            <div className="text-sm text-muted-foreground">No suspicious activity detected.</div>
                          ) : (
                            <div className="space-y-2">
                              {(securitySummary?.alerts || []).map((alert: any, index: number) => (
                                <div key={`${alert.type}-${index}`} className="rounded-lg border border-border/70 bg-card/70 p-2 text-sm">
                                  <div className="font-medium text-foreground">{alert.message}</div>
                                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{alert.severity}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            <Monitor className="h-3.5 w-3.5" /> Active Devices
                          </div>
                          {(securitySummary?.sessions?.length ? securitySummary.sessions : []).length === 0 ? (
                            <div className="text-sm text-muted-foreground">No active sessions recorded.</div>
                          ) : (
                            <div className="space-y-2">
                              {(securitySummary?.sessions || []).map((session: any) => (
                                <div key={session.id} className="rounded-lg border border-border/70 bg-card/70 p-2 text-sm">
                                  <div className="font-medium">{session.userAgent || "Unknown device"}</div>
                                  <div className="text-xs text-muted-foreground">{session.ipAddress || "Unknown IP"} • last seen {new Date(session.lastSeenAt).toLocaleString()}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {canViewSecurityFeed && (
                          <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              <ShieldAlert className="h-3.5 w-3.5" /> Suspicious Activity Feed
                            </div>
                            {loadingSecurityFeed ? (
                              <div className="text-sm text-muted-foreground">Loading security feed…</div>
                            ) : (securityFeed?.length ? securityFeed : []).length === 0 ? (
                              <div className="text-sm text-muted-foreground">No suspicious activity recorded.</div>
                            ) : (
                              <div className="space-y-2">
                                {(securityFeed || []).slice(0, 8).map((item: any) => (
                                  <div key={item.id} className="rounded-lg border border-border/70 bg-card/70 p-2 text-sm">
                                    <div className="font-medium">{item.user}</div>
                                    <div className="text-xs text-muted-foreground">{item.reason || item.action} • {item.ipAddress || "Unknown IP"}</div>
                                    <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </DialogContent>
              </Dialog>

              <div className="ml-auto w-full max-w-xs">
                <UniversalSearch range={range} placeholder="Search anything" autoFocus />
              </div>
            </div>
          </div>

        </div>

      {/* inline expanding search handled next to icon */}

        {loadingRangeSummary ? (
          <SectionLoading label="Crunching the numbers" />
        ) : rangeSummary && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard title={`Revenue (${rangeSummary.label || range.preset})`} value={`Rs. ${(rangeSummary.totalRevenue ?? 0).toLocaleString()}`} icon={DollarSign} highlight />
            <KpiCard title="Gross Profit" value={`Rs. ${(rangeSummary.grossProfit ?? 0).toLocaleString()}`} icon={TrendingUp} />
            <KpiCard title="COGS" value={`Rs. ${(rangeSummary.cogs ?? 0).toLocaleString()}`} icon={Truck} />
            <KpiCard title="Net Profit" value={`Rs. ${(rangeSummary.netProfit ?? 0).toLocaleString()}`} icon={Activity} />
          </div>
        )}

        {!loadingSummary && summary && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard title="Inventory Value" value={`Rs. ${(rangeSummary?.inventoryValue ?? 0).toLocaleString()}`} icon={Warehouse} />
            <KpiCard title="Low Stock Items" value={lowStock?.length?.toString() || "0"} icon={AlertTriangle} alert={!!lowStock?.length} />
            <KpiCard title="Active Customers" value={summary.totalCustomers?.toLocaleString() || "0"} icon={Users} />
            <KpiCard title="Stock Items" value={summary.totalProducts?.toLocaleString() || "0"} icon={Package} />
          </div>
        )}

        <Card className="border-border/70 bg-card/90">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Sales Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="col-span-2 h-72 sm:h-96 lg:h-[420px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData || []} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.32} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(value) => (value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value)} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))", fontSize: 12 }} />
                    <Area type="monotone" dataKey="sales" name="Revenue" stroke="hsl(var(--primary))" fill="url(#revGrad)" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-3">
                <div className="min-h-[12rem] bg-background/70 p-4 rounded-3xl border border-border shadow-sm shadow-slate-200/40">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Current Time</div>
                        <div className="mt-2 text-lg font-semibold text-foreground">{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                        <div className="text-sm text-muted-foreground">{currentTime.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
                      </div>
                      <div className="rounded-2xl bg-primary/10 px-3 py-2 text-right text-xs uppercase tracking-[0.16em] text-primary shadow-inner shadow-primary/10">
                        Realtime
                      </div>
                    </div>
                  </div>
                </div>

                <div className="min-h-[14rem] bg-background/70 p-4 rounded-3xl border border-border shadow-sm shadow-slate-200/40">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-3">Live KPI Share</div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-card/80 p-3 border border-border/80">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Revenue</div>
                      <div className="mt-2 text-lg font-semibold">Rs. {(rangeSummary?.totalRevenue ?? 0).toLocaleString()}</div>
                    </div>
                    <div className="rounded-2xl bg-card/80 p-3 border border-border/80">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Gross Profit</div>
                      <div className="mt-2 text-lg font-semibold">Rs. {(rangeSummary?.grossProfit ?? 0).toLocaleString()}</div>
                    </div>
                    <div className="rounded-2xl bg-card/80 p-3 border border-border/80">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">COGS</div>
                      <div className="mt-2 text-lg font-semibold">Rs. {(rangeSummary?.cogs ?? 0).toLocaleString()}</div>
                    </div>
                    <div className="rounded-2xl bg-card/80 p-3 border border-border/80">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Net Profit</div>
                      <div className="mt-2 text-lg font-semibold">Rs. {(rangeSummary?.netProfit ?? 0).toLocaleString()}</div>
                    </div>
                  </div>
                </div>

                <div className="min-h-[14rem] bg-background/70 p-2 rounded-md border border-border overflow-hidden">
                  <div className="text-xs font-semibold text-muted-foreground mb-2">Recent Conversions</div>
                  <div className="overflow-auto text-sm">
                    <table className="w-full table-auto">
                      <tbody>
                        {recent.isLoading ? (
                          <tr><td className="text-muted-foreground">Loading…</td></tr>
                        ) : (recent.data || []).length === 0 ? (
                          <tr><td className="text-muted-foreground">No recent conversions</td></tr>
                        ) : (recent.data || []).slice(0,6).map((r: any) => (
                          <tr key={`${r.type}-${r.id}`} className="border-b border-border/50">
                            <td className="py-2 text-xs text-muted-foreground">{new Date(r.createdAt || r.created_at || r.createdAt).toLocaleDateString()}</td>
                            <td className="py-2 text-xs">{r.type}</td>
                            <td className="py-2 text-right text-xs font-semibold">{r.amount ? `Rs. ${Number(r.amount).toLocaleString()}` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
      </div>
    </Layout>
  );
}

function KpiCard({ title, value, icon: Icon, highlight, alert }: {
  title: string;
  value: string;
  icon: any;
  highlight?: boolean;
  alert?: boolean;
}) {
  return (
    <Card className={`rounded-2xl border border-border/70 bg-card/90 min-h-[92px] ${highlight ? "border-primary/50 shadow-[0_6px_30px_rgba(56,189,248,0.06)]" : ""} ${alert ? "border-destructive/50 shadow-[0_6px_30px_rgba(248,113,113,0.06)]" : ""}`}>
      <CardHeader className="flex items-center justify-between gap-3 p-4">
        <div>
          <CardTitle className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</CardTitle>
        </div>
        <Icon className={`h-5 w-5 ${alert ? "text-destructive" : highlight ? "text-primary" : "text-muted-foreground"}`} />
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className={`text-2xl font-bold sm:text-3xl ${highlight ? "text-primary" : alert ? "text-destructive" : "text-foreground"}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
