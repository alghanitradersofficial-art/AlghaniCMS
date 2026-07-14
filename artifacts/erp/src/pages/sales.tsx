import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { fmtCurrency, fmtDate } from '../lib/utils';
import toast from 'react-hot-toast';
import { Plus, Search, Trash2, Eye, X, ChevronLeft, ChevronRight } from 'lucide-react';

type Sale = { id: number; invoiceNumber: string; customerName: string; status: string; total: number; discount: number; saleDate: string; items: any[]; notes?: string; paidAmount?: number };

const STATUS_COLORS: Record<string, string> = { completed: 'badge-green', pending: 'badge-yellow', cancelled: 'badge-red' };

function SaleModal({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ customerName: '', customerId: '', status: 'completed', discount: '0', paidAmount: '', notes: '', saleDate: new Date().toISOString().slice(0,10), items: [{ productName: '', quantity: '1', unitPrice: '0', total: '0' }] });
  const [searching, setSearching] = useState(false);
  const [custSuggestions, setCustSuggestions] = useState<any[]>([]);

  const total = form.items.reduce((a, i) => a + (Number(i.quantity) * Number(i.unitPrice)), 0) - Number(form.discount || 0);

  const searchCustomers = async (q: string) => {
    if (!q) { setCustSuggestions([]); return; }
    const { data } = await api.get(`/customers/suggestions?q=${q}`);
    setCustSuggestions(data);
  };

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { productName: '', quantity: '1', unitPrice: '0', total: '0' }] }));
  const removeItem = (i: number) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
  const updateItem = (i: number, key: string, val: string) => {
    setForm(f => { const items = [...f.items]; items[i] = { ...items[i], [key]: val, total: String(Number(items[i].quantity) * Number(items[i].unitPrice)) }; 
      if (key === 'quantity' || key === 'unitPrice') { const q = key === 'quantity' ? Number(val) : Number(items[i].quantity); const u = key === 'unitPrice' ? Number(val) : Number(items[i].unitPrice); items[i].total = String(q * u); }
      return { ...f, items }; });
  };

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => api.post('/sales', { ...form, total, items: form.items.map(i => ({ ...i, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), total: Number(i.quantity) * Number(i.unitPrice) })), paidAmount: Number(form.paidAmount || total), discount: Number(form.discount || 0) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sales'] }); qc.invalidateQueries({ queryKey: ['dashboard-summary'] }); toast.success('Sale saved'); onClose(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-bold">New Sale</h2>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="relative">
              <label className="label">Customer Name</label>
              <input className="input" value={form.customerName} onChange={e => { setForm(f => ({ ...f, customerName: e.target.value, customerId: '' })); searchCustomers(e.target.value); }} placeholder="Search customer..." />
              {custSuggestions.length > 0 && (
                <div className="absolute z-10 w-full bg-white border rounded-lg shadow-lg mt-1">
                  {custSuggestions.map(c => <button key={c.id} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm" onClick={() => { setForm(f => ({ ...f, customerName: c.name, customerId: String(c.id) })); setCustSuggestions([]); }}>{c.name} - {c.phone}</button>)}
                </div>
              )}
            </div>
            <div><label className="label">Date</label><input type="date" className="input" value={form.saleDate} onChange={e => setForm(f => ({ ...f, saleDate: e.target.value }))} /></div>
            <div><label className="label">Status</label><select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}><option value="completed">Completed</option><option value="pending">Pending</option><option value="cancelled">Cancelled</option></select></div>
            <div><label className="label">Discount (PKR)</label><input type="number" className="input" value={form.discount} onChange={e => setForm(f => ({ ...f, discount: e.target.value }))} /></div>
            <div><label className="label">Paid Amount (PKR)</label><input type="number" className="input" value={form.paidAmount} onChange={e => setForm(f => ({ ...f, paidAmount: e.target.value }))} placeholder={String(total)} /></div>
            <div><label className="label">Notes</label><input className="input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2"><span className="label !mb-0">Items</span><button onClick={addItem} className="btn-secondary btn-sm"><Plus size={14} />Add Item</button></div>
            <table className="table w-full"><thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Total</th><th></th></tr></thead>
              <tbody>{form.items.map((item, i) => (
                <tr key={i}>
                  <td><input className="input" value={item.productName} onChange={e => updateItem(i, 'productName', e.target.value)} placeholder="Product name" /></td>
                  <td><input type="number" className="input w-20" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} /></td>
                  <td><input type="number" className="input w-28" value={item.unitPrice} onChange={e => updateItem(i, 'unitPrice', e.target.value)} /></td>
                  <td className="font-semibold">{fmtCurrency(Number(item.total))}</td>
                  <td><button onClick={() => removeItem(i)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button></td>
                </tr>
              ))}</tbody>
            </table>
            <div className="text-right mt-2 text-lg font-bold text-blue-700">Total: {fmtCurrency(total)}</div>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-6 border-t">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => save()} disabled={isPending} className="btn-primary">{isPending ? 'Saving...' : 'Save Sale'}</button>
        </div>
      </div>
    </div>
  );
}

export default function Sales() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [viewSale, setViewSale] = useState<Sale | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['sales', page, search], queryFn: () => api.get(`/sales?page=${page}&limit=20&search=${search}`).then(r => r.data) });
  const { mutate: deleteSale } = useMutation({ mutationFn: (id: number) => api.delete(`/sales/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['sales'] }); toast.success('Deleted'); }, onError: () => toast.error('Failed to delete') });

  const sales: Sale[] = data?.data || [];
  const total = data?.total || 0;
  const pages = Math.ceil(total / 20);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="page-title">Sales</h1><p className="text-gray-500 text-sm">{total} total records</p></div>
        <button onClick={() => setShowModal(true)} className="btn-primary"><Plus size={16} />New Sale</button>
      </div>
      <div className="card">
        <div className="card-header">
          <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input className="input pl-9 w-72" placeholder="Search by customer..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div>
        </div>
        <div className="table-container">
          <table className="table">
            <thead><tr><th>Date</th><th>Invoice #</th><th>Customer</th><th>Status</th><th>Total</th><th>Actions</th></tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={6} className="text-center py-10 text-gray-400">Loading...</td></tr> :
               sales.length === 0 ? <tr><td colSpan={6} className="text-center py-10 text-gray-400">No sales found</td></tr> :
               sales.map(s => (
                <tr key={s.id}>
                  <td>{fmtDate(s.saleDate)}</td>
                  <td className="font-mono text-blue-700">{s.invoiceNumber}</td>
                  <td className="font-medium">{s.customerName}</td>
                  <td><span className={STATUS_COLORS[s.status] || 'badge-gray'}>{s.status}</span></td>
                  <td className="font-semibold">{fmtCurrency(s.total)}</td>
                  <td className="flex gap-2">
                    <button onClick={() => setViewSale(s)} className="btn-secondary btn-sm"><Eye size={13} /></button>
                    <button onClick={() => confirm('Delete?') && deleteSale(s.id)} className="btn-danger btn-sm"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && <div className="flex items-center justify-between px-5 py-3 border-t">
          <span className="text-sm text-gray-500">Page {page} of {pages}</span>
          <div className="flex gap-2"><button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary btn-sm"><ChevronLeft size={14} /></button><button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="btn-secondary btn-sm"><ChevronRight size={14} /></button></div>
        </div>}
      </div>
      {showModal && <SaleModal sale={null} onClose={() => setShowModal(false)} />}
      {viewSale && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setViewSale(null)}>
          <div className="modal">
            <div className="flex items-center justify-between p-6 border-b"><h2 className="font-bold text-lg">Sale #{viewSale.invoiceNumber}</h2><button onClick={() => setViewSale(null)}><X size={20} /></button></div>
            <div className="p-6 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm"><div><span className="text-gray-500">Customer:</span> <strong>{viewSale.customerName}</strong></div><div><span className="text-gray-500">Date:</span> {fmtDate(viewSale.saleDate)}</div><div><span className="text-gray-500">Status:</span> <span className={STATUS_COLORS[viewSale.status]}>{viewSale.status}</span></div><div><span className="text-gray-500">Total:</span> <strong className="text-blue-700">{fmtCurrency(viewSale.total)}</strong></div></div>
              {viewSale.items?.length > 0 && <table className="table w-full mt-3"><thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>{viewSale.items.map((item, i) => <tr key={i}><td>{item.productName}</td><td>{item.quantity}</td><td>{fmtCurrency(item.unitPrice)}</td><td className="font-semibold">{fmtCurrency(item.total)}</td></tr>)}</tbody></table>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
