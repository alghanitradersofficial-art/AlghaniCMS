import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { fmtCurrency, fmtDate } from '../lib/utils';
import toast from 'react-hot-toast';
import { Plus, Search, Trash2, Edit2, X, ChevronLeft, ChevronRight } from 'lucide-react';

const EXPENSE_CATEGORIES = ['Rent', 'Utilities', 'Salaries', 'Transport', 'Maintenance', 'Marketing', 'Office', 'Miscellaneous'];

type Expense = { id: number; title: string; category: string; amount: number; date: string; notes?: string };

function ExpenseModal({ expense, onClose }: { expense: Expense | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(expense ? { title: expense.title, category: expense.category, amount: String(expense.amount), date: expense.date.slice(0,10), notes: expense.notes || '' } : { title: '', category: 'Miscellaneous', amount: '', date: new Date().toISOString().slice(0,10), notes: '' });

  const { mutate, isPending } = useMutation({
    mutationFn: () => expense ? api.put(`/expenses/${expense.id}`, { ...form, amount: Number(form.amount) }) : api.post('/expenses', { ...form, amount: Number(form.amount) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['dashboard-summary'] }); toast.success(expense ? 'Updated' : 'Added'); onClose(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-sm">
        <div className="flex items-center justify-between p-6 border-b"><h2 className="font-bold">{expense ? 'Edit Expense' : 'Add Expense'}</h2><button onClick={onClose}><X size={20} /></button></div>
        <div className="p-6 grid grid-cols-2 gap-4">
          <div className="col-span-2"><label className="label">Title</label><input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required /></div>
          <div><label className="label">Category</label><select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>{EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><label className="label">Amount (PKR)</label><input type="number" className="input" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required /></div>
          <div><label className="label">Date</label><input type="date" className="input" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
          <div><label className="label">Notes</label><input className="input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
        </div>
        <div className="flex justify-end gap-3 p-6 border-t"><button onClick={onClose} className="btn-secondary">Cancel</button><button onClick={() => mutate()} disabled={isPending} className="btn-primary">{isPending ? 'Saving...' : 'Save'}</button></div>
      </div>
    </div>
  );
}

export default function Expenses() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editExp, setEditExp] = useState<Expense | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['expenses', page, search], queryFn: () => api.get(`/expenses?page=${page}&limit=20&search=${search}`).then(r => r.data) });
  const { mutate: del } = useMutation({ mutationFn: (id: number) => api.delete(`/expenses/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); toast.success('Deleted'); } });

  const expenses: Expense[] = data?.data || [];
  const pages = Math.ceil((data?.total || 0) / 20);
  const totalAmount = expenses.reduce((a, e) => a + e.amount, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="page-title">Expenses</h1><p className="text-gray-500 text-sm">{data?.total || 0} records · This page total: {fmtCurrency(totalAmount)}</p></div>
        <button onClick={() => { setEditExp(null); setShowModal(true); }} className="btn-primary"><Plus size={16} />Add Expense</button>
      </div>
      <div className="card">
        <div className="card-header"><div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input className="input pl-9 w-72" placeholder="Search expenses..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div></div>
        <div className="table-container"><table className="table"><thead><tr><th>Date</th><th>Title</th><th>Category</th><th>Amount</th><th>Notes</th><th>Actions</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={6} className="text-center py-10 text-gray-400">Loading...</td></tr> :
             expenses.length === 0 ? <tr><td colSpan={6} className="text-center py-10 text-gray-400">No expenses found</td></tr> :
             expenses.map(e => (
              <tr key={e.id}>
                <td>{fmtDate(e.date)}</td>
                <td className="font-medium">{e.title}</td>
                <td><span className="badge-gray">{e.category}</span></td>
                <td className="font-semibold text-red-600">{fmtCurrency(e.amount)}</td>
                <td className="text-gray-400">{e.notes || '-'}</td>
                <td className="flex gap-1">
                  <button onClick={() => { setEditExp(e); setShowModal(true); }} className="btn-secondary btn-sm"><Edit2 size={13} /></button>
                  <button onClick={() => confirm('Delete?') && del(e.id)} className="btn-danger btn-sm"><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {pages > 1 && <div className="flex items-center justify-between px-5 py-3 border-t"><span className="text-sm text-gray-500">Page {page} of {pages}</span><div className="flex gap-2"><button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary btn-sm"><ChevronLeft size={14} /></button><button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="btn-secondary btn-sm"><ChevronRight size={14} /></button></div></div>}
      </div>
      {showModal && <ExpenseModal expense={editExp} onClose={() => { setShowModal(false); setEditExp(null); }} />}
    </div>
  );
}
