import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import api from '../lib/api';
import { fmtCurrency, fmtDate } from '../lib/utils';
import toast from 'react-hot-toast';
import { Plus, Search, Trash2, Edit2, BookOpen, X, ChevronLeft, ChevronRight } from 'lucide-react';

type Customer = { id: number; name: string; phone: string; email?: string; city?: string; type: string; totalOrders: number; totalSpent: number; currentBalance: number; openingBalance: number; createdAt: string };

const TYPE_COLORS: Record<string, string> = { retail: 'badge-blue', dealer: 'badge-yellow', wholesale: 'badge-green' };

function CustomerModal({ cust, onClose }: { cust: Customer | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(cust ? { name: cust.name, phone: cust.phone, email: cust.email || '', city: cust.city || '', type: cust.type, openingBalance: String(cust.openingBalance), createdAt: cust.createdAt.slice(0,10) } : { name: '', phone: '', email: '', city: '', type: 'retail', openingBalance: '0', createdAt: new Date().toISOString().slice(0,10) });

  const { mutate, isPending } = useMutation({
    mutationFn: () => cust ? api.put(`/customers/${cust.id}`, form) : api.post('/customers', { ...form, openingBalance: Number(form.openingBalance) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); toast.success(cust ? 'Updated' : 'Created'); onClose(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-sm">
        <div className="flex items-center justify-between p-6 border-b"><h2 className="font-bold">{cust ? 'Edit Customer' : 'New Customer'}</h2><button onClick={onClose}><X size={20} /></button></div>
        <div className="p-6 grid grid-cols-2 gap-4">
          <div className="col-span-2"><label className="label">Name</label><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required /></div>
          <div><label className="label">Email</label><input className="input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          <div><label className="label">City</label><input className="input" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
          <div><label className="label">Type</label><select className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}><option value="retail">Retail</option><option value="dealer">Dealer</option><option value="wholesale">Wholesale</option></select></div>
          <div><label className="label">Opening Balance (PKR)</label><input type="number" className="input" value={form.openingBalance} onChange={e => setForm(f => ({ ...f, openingBalance: e.target.value }))} /></div>
          {!cust && <div><label className="label">Date Added</label><input type="date" className="input" value={form.createdAt} onChange={e => setForm(f => ({ ...f, createdAt: e.target.value }))} /></div>}
        </div>
        <div className="flex justify-end gap-3 p-6 border-t"><button onClick={onClose} className="btn-secondary">Cancel</button><button onClick={() => mutate()} disabled={isPending} className="btn-primary">{isPending ? 'Saving...' : 'Save'}</button></div>
      </div>
    </div>
  );
}

export default function Customers() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editCust, setEditCust] = useState<Customer | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['customers', page, search], queryFn: () => api.get(`/customers?page=${page}&limit=20&search=${search}`).then(r => r.data) });
  const { mutate: del } = useMutation({ mutationFn: (id: number) => api.delete(`/customers/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); toast.success('Deleted'); } });

  const customers: Customer[] = data?.data || [];
  const pages = Math.ceil((data?.total || 0) / 20);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="page-title">Customers</h1><p className="text-gray-500 text-sm">{data?.total || 0} total</p></div>
        <button onClick={() => { setEditCust(null); setShowModal(true); }} className="btn-primary"><Plus size={16} />New Customer</button>
      </div>
      <div className="card">
        <div className="card-header"><div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input className="input pl-9 w-72" placeholder="Search customers..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div></div>
        <div className="table-container"><table className="table"><thead><tr><th>Name</th><th>Phone</th><th>City</th><th>Type</th><th>Total Orders</th><th>Total Spent</th><th>Balance</th><th>Actions</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={8} className="text-center py-10 text-gray-400">Loading...</td></tr> :
             customers.length === 0 ? <tr><td colSpan={8} className="text-center py-10 text-gray-400">No customers found</td></tr> :
             customers.map(c => (
              <tr key={c.id}>
                <td className="font-medium">{c.name}</td>
                <td>{c.phone}</td>
                <td>{c.city || '-'}</td>
                <td><span className={TYPE_COLORS[c.type] || 'badge-gray'}>{c.type}</span></td>
                <td>{c.totalOrders}</td>
                <td>{fmtCurrency(c.totalSpent)}</td>
                <td className={c.currentBalance > 0 ? 'text-red-600 font-semibold' : c.currentBalance < 0 ? 'text-green-600 font-semibold' : ''}>{fmtCurrency(Math.abs(c.currentBalance))} {c.currentBalance > 0 ? 'Dr' : c.currentBalance < 0 ? 'Cr' : ''}</td>
                <td className="flex gap-1">
                  <Link href={`/customers/${c.id}/ledger`}><a className="btn-secondary btn-sm"><BookOpen size={13} /></a></Link>
                  <button onClick={() => { setEditCust(c); setShowModal(true); }} className="btn-secondary btn-sm"><Edit2 size={13} /></button>
                  <button onClick={() => confirm('Delete?') && del(c.id)} className="btn-danger btn-sm"><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {pages > 1 && <div className="flex items-center justify-between px-5 py-3 border-t"><span className="text-sm text-gray-500">Page {page} of {pages}</span><div className="flex gap-2"><button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary btn-sm"><ChevronLeft size={14} /></button><button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="btn-secondary btn-sm"><ChevronRight size={14} /></button></div></div>}
      </div>
      {showModal && <CustomerModal cust={editCust} onClose={() => { setShowModal(false); setEditCust(null); }} />}
    </div>
  );
}
