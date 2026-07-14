import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../lib/api';
import { fmtCurrency, MONTH_NAMES } from '../lib/utils';
import toast from 'react-hot-toast';
import { Download, Send, BarChart3, TrendingUp, ShoppingCart, Truck, Users, Building2, Receipt } from 'lucide-react';

const now = new Date();

export default function Reports() {
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [sending, setSending] = useState(false);
  const [channels, setChannels] = useState({ email: true, telegram: true });

  const { data: summary, isLoading } = useQuery({
    queryKey: ['monthly-summary', year, month],
    queryFn: () => api.get(`/reports/monthly-summary?year=${year}&month=${month}`).then(r => r.data),
  });

  const { data: plData } = useQuery({
    queryKey: ['pl-report', year, month],
    queryFn: () => api.get(`/reports/profit-loss?period=monthly&year=${year}&month=${month}`).then(r => r.data),
  });

  const downloadExcel = async () => {
    try {
      const resp = await api.post('/reports/export-excel', { year, month }, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([resp.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `AlGhani_${MONTH_NAMES[month - 1]}_${year}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Excel report downloaded');
    } catch { toast.error('Failed to download report'); }
  };

  const sendReport = async () => {
    setSending(true);
    try {
      const ch = Object.entries(channels).filter(([, v]) => v).map(([k]) => k);
      const { data } = await api.post('/reports/send-report', { year, month, channels: ch });
      if (data.errors?.length) toast.error(`Partial send: ${data.errors.join(', ')}`);
      else toast.success('Report sent successfully!');
    } catch { toast.error('Failed to send report'); }
    finally { setSending(false); }
  };

  const s = summary || {};
  const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="page-title">Reports</h1><p className="text-gray-500 text-sm">Monthly financial reports for Al Ghani Traders</p></div>
        <div className="flex gap-2 flex-wrap">
          <select className="input w-24" value={year} onChange={e => setYear(Number(e.target.value))}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
          <select className="input w-36" value={month} onChange={e => setMonth(Number(e.target.value))}>{MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select>
          <button onClick={downloadExcel} className="btn-success"><Download size={15} />Export Excel</button>
        </div>
      </div>

      {/* Send Report Section */}
      <div className="card">
        <div className="card-header"><h3 className="font-semibold flex items-center gap-2"><Send size={16} />Send Report - {MONTH_NAMES[month - 1]} {year}</h3></div>
        <div className="card-body flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={channels.email} onChange={e => setChannels(c => ({ ...c, email: e.target.checked }))} />Email (CEO)</label>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={channels.telegram} onChange={e => setChannels(c => ({ ...c, telegram: e.target.checked }))} />Telegram</label>
          <button onClick={sendReport} disabled={sending || (!channels.email && !channels.telegram)} className="btn-primary"><Send size={14} />{sending ? 'Sending...' : 'Send Report'}</button>
        </div>
      </div>

      {/* Monthly Summary KPIs */}
      {isLoading ? <div className="text-center py-10 text-gray-400">Loading...</div> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="kpi-card"><div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0"><ShoppingCart size={18} className="text-white" /></div><div><p className="text-xs text-gray-500">Total Sales</p><p className="text-lg font-bold text-blue-700">{fmtCurrency(s.totalSales || 0)}</p><p className="text-xs text-gray-400">{(s.sales || []).length} invoices</p></div></div>
            <div className="kpi-card"><div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center flex-shrink-0"><Truck size={18} className="text-white" /></div><div><p className="text-xs text-gray-500">Total Purchases</p><p className="text-lg font-bold text-orange-700">{fmtCurrency(s.totalPurchases || 0)}</p><p className="text-xs text-gray-400">{(s.purchases || []).length} orders</p></div></div>
            <div className="kpi-card"><div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center flex-shrink-0"><Receipt size={18} className="text-white" /></div><div><p className="text-xs text-gray-500">Total Expenses</p><p className="text-lg font-bold text-red-700">{fmtCurrency(s.totalExpenses || 0)}</p></div></div>
            <div className="kpi-card"><div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${(s.netProfit || 0) >= 0 ? 'bg-green-600' : 'bg-red-600'}`}><TrendingUp size={18} className="text-white" /></div><div><p className="text-xs text-gray-500">Net Profit</p><p className={`text-lg font-bold ${(s.netProfit || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtCurrency(s.netProfit || 0)}</p></div></div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="kpi-card"><div className="w-10 h-10 bg-teal-600 rounded-lg flex items-center justify-center flex-shrink-0"><Users size={18} className="text-white" /></div><div><p className="text-xs text-gray-500">Customer Receivable</p><p className="text-lg font-bold text-teal-700">{fmtCurrency(s.totalReceivable || 0)}</p><p className="text-xs text-gray-400">Outstanding from customers</p></div></div>
            <div className="kpi-card"><div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center flex-shrink-0"><Building2 size={18} className="text-white" /></div><div><p className="text-xs text-gray-500">Supplier Payable</p><p className="text-lg font-bold text-purple-700">{fmtCurrency(s.totalPayable || 0)}</p><p className="text-xs text-gray-400">Amount owed to suppliers</p></div></div>
          </div>

          {/* P&L Summary */}
          <div className="card">
            <div className="card-header"><h3 className="font-semibold flex items-center gap-2"><BarChart3 size={16} />Profit & Loss - {MONTH_NAMES[month - 1]} {year}</h3></div>
            <div className="card-body">
              <div className="space-y-3">
                {[
                  { label: 'Revenue (Sales)', value: s.totalSales || 0, color: 'text-blue-700' },
                  { label: 'Cost of Goods (Purchases)', value: s.totalPurchases || 0, color: 'text-orange-600', negative: true },
                  { label: 'Gross Profit', value: s.grossProfit || 0, color: s.grossProfit >= 0 ? 'text-green-700' : 'text-red-600', bold: true },
                  { label: 'Operating Expenses', value: s.totalExpenses || 0, color: 'text-red-600', negative: true },
                  { label: 'Net Profit / Loss', value: s.netProfit || 0, color: s.netProfit >= 0 ? 'text-green-700' : 'text-red-700', bold: true, border: true },
                ].map((row, i) => (
                  <div key={i} className={`flex justify-between items-center py-2 ${row.border ? 'border-t-2 border-gray-300 pt-3' : ''}`}>
                    <span className={`text-sm ${row.bold ? 'font-bold text-gray-900' : 'text-gray-600'}`}>{row.label}</span>
                    <span className={`font-semibold ${row.color}`}>{row.negative && row.value > 0 ? '- ' : ''}{fmtCurrency(Math.abs(row.value))}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sales Detail */}
          <div className="card">
            <div className="card-header"><h3 className="font-semibold">Sales Detail - {MONTH_NAMES[month - 1]}</h3></div>
            <div className="table-container"><table className="table"><thead><tr><th>Date</th><th>Invoice</th><th>Customer</th><th>Status</th><th>Total</th></tr></thead>
              <tbody>
                {(s.sales || []).slice(0, 20).map((sale: any) => <tr key={sale.id}><td>{new Date(sale.saleDate).toLocaleDateString('en-PK')}</td><td className="font-mono text-blue-700">{sale.invoiceNumber}</td><td>{sale.customerName}</td><td><span className={`badge ${sale.status === 'completed' ? 'badge-green' : 'badge-yellow'}`}>{sale.status}</span></td><td className="font-semibold">{fmtCurrency(sale.total)}</td></tr>)}
                {!s.sales?.length && <tr><td colSpan={5} className="text-center py-8 text-gray-400">No sales this month</td></tr>}
              </tbody>
              {s.sales?.length > 0 && <tfoot><tr><td colSpan={4} className="text-right font-bold px-4 py-2">Grand Total:</td><td className="font-bold text-blue-700 px-4 py-2">{fmtCurrency(s.totalSales)}</td></tr></tfoot>}
            </table></div>
          </div>
        </>
      )}
    </div>
  );
}
