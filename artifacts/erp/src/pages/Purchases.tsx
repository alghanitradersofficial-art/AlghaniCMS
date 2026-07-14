import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { fmtCurrency, fmtDate } from '../lib/utils';
import toast from 'react-hot-toast';
import { Plus, Search, Trash2, Eye, X, ChevronLeft, ChevronRight } from 'lucide-react';

type Purchase = { id: number; poNumber: string; supplierName: string; status: string; total: number; purchaseDate: string; items: any[]; notes?: string };

const STATUS_COLORS: Record<string, string> = { received: 'badge-green', pending: 'badge-yellow', cancelled: 'badge-red' };

export default function Purchases() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [viewItem, setViewItem] = useState<Purchase | null>(null);
  const [form, setForm] = useState({ supplierName: '', supplierId: '', status: 'received', notes: '', purchaseDate: new Date().toISOString().slice(0, 10), items: [{ productName: '', quantity: '1', unitCost: '0', total: '0' }] });
  const [suppSuggestions, setSuppSuggestions] = useState<any[]>([]);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['purchases', page, search], queryFn: () => api.get(`/purchases?page=${page}&limit=20&search=${search}`).then(r => r.data) });
  const { mutate: deletePurchase } = useMutation({ mutationFn: (id: number) => api.delete(`/purchases/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchases'] }); toast.success('Deleted'); } });

  const total = form.items.reduce((a, i) => a + Number(i.quantity) * Number(i.unitCost), 0);

  const searchSuppliers = async (q: string) => {
    if (!q) { setSuppSuggestions([]); return; }
    const { data } = await api.get(`/suppliers/suggestions?q=${q}`);
    setSuppSuggestions(data);
  };

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { productName: '', quantity: '1', unitCost: '0', total: '0' }] }));
  const removeItem = (i: number) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
  const updateItem = (i: number, key: string, val: string) => {
    setForm(f => { const items = [...f.items]; items[i] = { ...items[i], [key]: val }; const q = Number(key === 'quantity' ? val : items[i].quantity); const u = Number(key === 'unitCost' ? val : items[i].unitCost); items[i].total = String(q * u); return { ...f, items }; });
  };

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => api.post('/purchases', { ...form, total, subtotal: total, items: form.items.map(i => ({ ...i, quantity: Number(i.quantity), unitCost: Number(i.unitCost), total: Number(i.quantity) * Number(i.unitCost) })) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchases'] }); qc.invalidateQueries({ queryKey: ['dashboard-summary'] }); toast.success('Purchase saved'); setShowModal(false); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const purchases: Purchase[] = data?.data || [];
  const pages = Math.ceil((data?.total || 0) / 20);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="page-title">Purchases</h1><p className="text-gray-500 text-sm">{data?.total || 0} total records</p></div>
        <button onClick={() => setShowModal(true)} className="btn-primary"><Plus size={16} />New Purchase</button>
      </div>
      <div className="card">
        <div className="card-header"><div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input className="input pl-9 w-72" placeholder="Search by supplier..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div></div>
        <div className="table-container"><table className="table"><thead><tr><th>Date</th><th>PO #</th><th>Supplier</th><th>Status</th><th>Total</th><th>Actions</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={6} className="text-center py-10 text-gray-400">Loading...</td></tr> :
             purchases.length === 0 ? <tr><td colSpan={6} className="text-center py-10 text-gray-400">No purchases found</td></tr> :
             purchases.map(p => (
              <tr key={p.id}>
                <td>{fmtDate(p.purchaseDate)}</td>
                <td className="font-mono text-orange-700">{p.poNumber}</td>
                <td className="font-medium">{p.supplierName}</td>
                <td><span className={STATUS_COLORS[p.status] || 'badge-gray'}>{p.status}</span></td>
                <td className="font-semibold">{fmtCurrency(p.total)}</td>
                <td className="flex gap-2">
                  <button onClick={() => setViewItem(p)} className="btn-secondary btn-sm"><Eye size={13} /></button>
                  <button onClick={() => confirm('Delete?') && deletePurchase(p.id)} className="btn-danger btn-sm"><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {pages > 1 && <div className="flex items-center justify-between px-5 py-3 border-t"><span className="text-sm text-gray-500">Page {page} of {pages}</span><div className="flex gap-2"><button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary btn-sm"><ChevronLeft size={14} /></button><button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="btn-secondary btn-sm"><ChevronRight size={14} /></button></div></div>}
      </div>

      {showModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal modal-lg">
            <div className="flex items-center justify-between p-6 border-b"><h2 className="text-lg font-bold">New Purchase</h2><button onClick={() => setShowModal(false)}><X size={20} /></button></div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="relative">
                  <label className="label">Supplier Name</label>
                  <input className="input" value={form.supplierName} onChange={e => { setForm(f => ({ ...f, supplierName: e.target.value, supplierId: '' })); searchSuppliers(e.target.value); }} placeholder="Search supplier..." />
                  {suppSuggestions.length > 0 && <div className="absolute z-10 w-full bg-white border rounded-lg shadow-lg mt-1">{suppSuggestions.map(s => <button key={s.id} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm" onClick={() => { setForm(f => ({ ...f, supplierName: s.name, supplierId: String(s.id) })); setSuppSuggestions([]); }}>{s.name} - {s.phone}</button>)}</div>}
                </div>
                <div><label className="label">Date</label><input type="date" className="input" value={form.purchaseDate} onChange={e => setForm(f => ({ ...f, purchaseDate: e.target.value }))} /></div>
                <div><label className="label">Status</label><select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}><option value="received">Received</option><option value="pending">Pending</option><option value="cancelled">Cancelled</option></select></div>
                <div><label className="label">Notes</label><input className="input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2"><span className="label !mb-0">Items</span><button onClick={addItem} className="btn-secondary btn-sm"><Plus size={14} />Add</button></div>
                <table className="table w-full"><thead><tr><th>Product</th><th>Qty</th><th>Unit Cost</th><th>Total</th><th></th></tr></thead>
                  <tbody>{form.items.map((item, i) => (
                    <tr key={i}>
                      <td><input className="input" value={item.productName} onChange={e => updateItem(i, 'productName', e.target.value)} /></td>
                      <td><input type="number" className="input w-20" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} /></td>
                      <td><input type="number" className="input w-28" value={item.unitCost} onChange={e => updateItem(i, 'unitCost', e.target.value)} /></td>
                      <td className="font-semibold">{fmtCurrency(Number(item.total))}</td>
                      <td><button onClick={() => removeItem(i)} className="text-red-500"><Trash2 size={14} /></button></td>
                    </tr>
                  ))}</tbody>
                </table>
                <div className="text-right mt-2 text-lg font-bold text-orange-700">Total: {fmtCurrency(total)}</div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t"><button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button><button onClick={() => save()} disabled={isPending} className="btn-primary">{isPending ? 'Saving...' : 'Save Purchase'}</button></div>
          </div>
        </div>
      )}
      {viewItem && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setViewItem(null)}>
          <div className="modal"><div className="flex items-center justify-between p-6 border-b"><h2 className="font-bold">PO #{viewItem.poNumber}</h2><button onClick={() => setViewItem(null)}><X size={20} /></button></div>
            <div className="p-6 space-y-3 text-sm"><div className="grid grid-cols-2 gap-2"><div><span className="text-gray-500">Supplier:</span> <strong>{viewItem.supplierName}</strong></div><div><span className="text-gray-500">Date:</span> {fmtDate(viewItem.purchaseDate)}</div><div><span className="text-gray-500">Status:</span> <span className={STATUS_COLORS[viewItem.status]}>{viewItem.status}</span></div><div><span className="text-gray-500">Total:</span> <strong className="text-orange-700">{fmtCurrency(viewItem.total)}</strong></div></div>
              {viewItem.items?.length > 0 && <table className="table w-full mt-2"><thead><tr><th>Product</th><th>Qty</th><th>Cost</th><th>Total</th></tr></thead><tbody>{viewItem.items.map((item, i) => <tr key={i}><td>{item.productName}</td><td>{item.quantity}</td><td>{fmtCurrency(item.unitCost)}</td><td className="font-semibold">{fmtCurrency(item.total)}</td></tr>)}</tbody></table>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
