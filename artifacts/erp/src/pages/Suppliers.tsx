import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import api from '../lib/api';
import { fmtCurrency } from '../lib/utils';
import toast from 'react-hot-toast';
import { Plus, Search, Trash2, Edit2, BookOpen, X, ChevronLeft, ChevronRight } from 'lucide-react';

type Supplier = { id: number; name: string; phone: string; email?: string; city?: string; openingBalance: number; currentBalance: number; createdAt: string };

function SupplierModal({ supp, onClose }: { supp: Supplier | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(supp ? { name: supp.name, phone: supp.phone, email: supp.email || '', city: supp.city || '', openingBalance: String(supp.openingBalance) } : { name: '', phone: '', email: '', city: '', openingBalance: '0' });

  const { mutate, isPending } = useMutation({
    mutationFn: () => supp ? api.put(`/suppliers/${supp.id}`, form) : api.post('/suppliers', { ...form, openingBalance: Number(form.openingBalance) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); toast.success(supp ? 'Updated' : 'Created'); onClose(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-sm">
        <div className="flex items-center justify-between p-6 border-b"><h2 className="font-bold">{supp ? 'Edit Supplier' : 'New Supplier'}</h2><button onClick={onClose}><X size={20} /></button></div>
        <div className="p-6 grid grid-cols-2 gap-4">
          <div className="col-span-2"><label className="label">Name</label><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required /></div>
          <div><label className="label">Email</label><input className="input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          <div><label className="label">City</label><input className="input" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
          <div><label className="label">Opening Balance (PKR)</label><input type="number" className="input" value={form.openingBalance} onChange={e => setForm(f => ({ ...f, openingBalance: e.target.value }))} /></div>
        </div>
        <div className="flex justify-end gap-3 p-6 border-t"><button onClick={onClose} className="btn-secondary">Cancel</button><button onClick={() => mutate()} disabled={isPending} className="btn-primary">{isPending ? 'Saving...' : 'Save'}</button></div>
      </div>
    </div>
  );
}

export default function Suppliers() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editSupp, setEditSupp] = useState<Supplier | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['suppliers', page, search], queryFn: () => api.get(`/suppliers?page=${page}&limit=20&search=${search}`).then(r => r.data) });
  const { mutate: del } = useMutation({ mutationFn: (id: number) => api.delete(`/suppliers/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); toast.success('Deleted'); } });

  const suppliers: Supplier[] = data?.data || [];
  const pages = Math.ceil((data?.total || 0) / 20);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="page-title">Suppliers</h1><p className="text-gray-500 text-sm">{data?.total || 0} total</p></div>
        <button onClick={() => { setEditSupp(null); setShowModal(true); }} className="btn-primary"><Plus size={16} />New Supplier</button>
      </div>
      <div className="card">
        <div className="card-header"><div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input className="input pl-9 w-72" placeholder="Search suppliers..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div></div>
        <div className="table-container"><table className="table"><thead><tr><th>Name</th><th>Phone</th><th>City</th><th>Opening Bal.</th><th>Current Balance</th><th>Actions</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={6} className="text-center py-10 text-gray-400">Loading...</td></tr> :
             suppliers.length === 0 ? <tr><td colSpan={6} className="text-center py-10 text-gray-400">No suppliers found</td></tr> :
             suppliers.map(s => (
              <tr key={s.id}>
                <td className="font-medium">{s.name}</td>
                <td>{s.phone}</td>
                <td>{s.city || '-'}</td>
                <td>{fmtCurrency(s.openingBalance)}</td>
                <td className={s.currentBalance > 0 ? 'text-orange-600 font-semibold' : 'text-green-600 font-semibold'}>{fmtCurrency(Math.abs(s.currentBalance))} {s.currentBalance > 0 ? 'Payable' : s.currentBalance < 0 ? 'Adv.' : ''}</td>
                <td className="flex gap-1">
                  <Link href={`/suppliers/${s.id}/ledger`}><a className="btn-secondary btn-sm"><BookOpen size={13} /></a></Link>
                  <button onClick={() => { setEditSupp(s); setShowModal(true); }} className="btn-secondary btn-sm"><Edit2 size={13} /></button>
                  <button onClick={() => confirm('Delete?') && del(s.id)} className="btn-danger btn-sm"><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {pages > 1 && <div className="flex items-center justify-between px-5 py-3 border-t"><span className="text-sm text-gray-500">Page {page} of {pages}</span><div className="flex gap-2"><button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary btn-sm"><ChevronLeft size={14} /></button><button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="btn-secondary btn-sm"><ChevronRight size={14} /></button></div></div>}
      </div>
      {showModal && <SupplierModal supp={editSupp} onClose={() => { setShowModal(false); setEditSupp(null); }} />}
    </div>
  );
}
