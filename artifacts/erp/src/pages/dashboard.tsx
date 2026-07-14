import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { fmtCurrency, fmtDate } from '../lib/utils';
import { TrendingUp, TrendingDown, Package, Users, ShoppingCart, Truck, AlertTriangle, DollarSign, Activity } from 'lucide-react';

function KPI({ label, value, icon: Icon, color, sub }: { label: string; value: string; icon: any; color: string; sub?: string }) {
  return (
    <div className="kpi-card">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold text-gray-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: summary } = useQuery({ queryKey: ['dashboard-summary'], queryFn: () => api.get('/dashboard/summary').then(r => r.data) });
  const { data: chart } = useQuery({ queryKey: ['dashboard-chart'], queryFn: () => api.get('/dashboard/sales-chart').then(r => r.data) });
  const { data: activity } = useQuery({ queryKey: ['dashboard-activity'], queryFn: () => api.get('/dashboard/recent-activity').then(r => r.data) });
  const { data: topProducts } = useQuery({ queryKey: ['dashboard-top'], queryFn: () => api.get('/dashboard/top-products').then(r => r.data) });
  const { data: lowStock } = useQuery({ queryKey: ['dashboard-low-stock'], queryFn: () => api.get('/dashboard/low-stock').then(r => r.data) });

  const s = summary || {};
  const chartData = chart || [];
  const maxVal = Math.max(...chartData.map((d: any) => d.sales), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Al Ghani Wholesale Traders - Business Overview</p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI label="Total Revenue" value={fmtCurrency(s.totalRevenue || 0)} icon={DollarSign} color="bg-blue-600" sub={`Today: ${fmtCurrency(s.todaySales || 0)}`} />
        <KPI label="Gross Profit" value={fmtCurrency(s.grossProfit || 0)} icon={TrendingUp} color={s.grossProfit >= 0 ? 'bg-green-600' : 'bg-red-500'} sub={`Net: ${fmtCurrency(s.netProfit || 0)}`} />
        <KPI label="Total Purchases" value={fmtCurrency(s.totalPurchases || 0)} icon={Truck} color="bg-orange-500" sub={`Expenses: ${fmtCurrency(s.totalExpenses || 0)}`} />
        <KPI label="Monthly Sales" value={fmtCurrency(s.monthlySales || 0)} icon={ShoppingCart} color="bg-purple-600" sub={`Weekly: ${fmtCurrency(s.weeklySales || 0)}`} />
        <KPI label="Total Customers" value={String(s.totalCustomers || 0)} icon={Users} color="bg-teal-600" />
        <KPI label="Total Products" value={String(s.totalProducts || 0)} icon={Package} color="bg-indigo-600" />
        <KPI label="Low Stock Alerts" value={String(s.lowStockCount || 0)} icon={AlertTriangle} color={s.lowStockCount > 0 ? 'bg-red-500' : 'bg-gray-400'} />
        <KPI label="Net Profit" value={fmtCurrency(s.netProfit || 0)} icon={Activity} color={s.netProfit >= 0 ? 'bg-emerald-600' : 'bg-red-600'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Chart */}
        <div className="card lg:col-span-2">
          <div className="card-header"><h3 className="font-semibold text-gray-800">Sales vs Purchases (Last 6 Months)</h3></div>
          <div className="card-body">
            <div className="flex items-end gap-3 h-40">
              {chartData.map((d: any, i: number) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex gap-0.5 items-end" style={{ height: '120px' }}>
                    <div className="flex-1 bg-blue-500 rounded-t transition-all" style={{ height: `${(d.sales / maxVal) * 100}%`, minHeight: d.sales > 0 ? '4px' : '0' }} title={`Sales: ${fmtCurrency(d.sales)}`} />
                    <div className="flex-1 bg-orange-400 rounded-t transition-all" style={{ height: `${(d.purchases / maxVal) * 100}%`, minHeight: d.purchases > 0 ? '4px' : '0' }} title={`Purchases: ${fmtCurrency(d.purchases)}`} />
                  </div>
                  <span className="text-xs text-gray-500 truncate w-full text-center">{d.label}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-4 mt-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500 rounded" />Sales</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-orange-400 rounded" />Purchases</span>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card">
          <div className="card-header"><h3 className="font-semibold text-gray-800">Recent Activity</h3></div>
          <div className="divide-y divide-gray-100">
            {(activity || []).slice(0, 8).map((a: any) => (
              <div key={a.id} className="px-5 py-3 flex justify-between items-start">
                <div>
                  <p className="text-sm text-gray-700 font-medium">{a.description}</p>
                  <p className="text-xs text-gray-400">{fmtDate(a.createdAt)}</p>
                </div>
                {a.amount != null && <span className="text-sm font-semibold text-blue-700">{fmtCurrency(a.amount)}</span>}
              </div>
            ))}
            {!activity?.length && <p className="px-5 py-8 text-center text-gray-400 text-sm">No recent activity</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Products */}
        <div className="card">
          <div className="card-header"><h3 className="font-semibold text-gray-800">Top Selling Products</h3></div>
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Product</th><th>Qty Sold</th><th>Revenue</th></tr></thead>
              <tbody>
                {(topProducts || []).slice(0, 8).map((p: any) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.name}</td>
                    <td>{p.totalSold}</td>
                    <td className="text-blue-700 font-semibold">{fmtCurrency(p.revenue)}</td>
                  </tr>
                ))}
                {!topProducts?.length && <tr><td colSpan={3} className="text-center py-8 text-gray-400">No data</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Low Stock */}
        <div className="card">
          <div className="card-header"><h3 className="font-semibold text-gray-800 flex items-center gap-2"><AlertTriangle size={16} className="text-red-500" />Low Stock Alerts</h3></div>
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Product</th><th>SKU</th><th>Stock</th><th>Min</th></tr></thead>
              <tbody>
                {(lowStock || []).map((p: any) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.name}</td>
                    <td className="text-gray-500">{p.sku}</td>
                    <td><span className="badge-red">{p.currentStock}</span></td>
                    <td className="text-gray-500">{p.minStock}</td>
                  </tr>
                ))}
                {!lowStock?.length && <tr><td colSpan={4} className="text-center py-8 text-green-600">All products well stocked</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
