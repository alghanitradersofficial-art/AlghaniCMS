import { useState } from 'react';
import { useParams, Link } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { fmtCurrency, fmtDate } from '../lib/utils';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, X } from 'lucide-react';

export default function SupplierLedger() {
  const { id } = useParams<{ id: string }>();
  const [page, setPage] = useState(1);
  const [showPayment, setShowPayment] = useState(false);
  const [payment, setPayment] = useState({ amount: '', description: 'Payment Made', date: new Date().toISOString().slice(0, 10) });
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['supplier-ledger', id, page], queryFn: () => api.get(`/suppliers/${id}/ledger?page=${page}&limit=50`).then(r => r.data) });
  const { mutate: addPayment, isPending } = useMutation({
    mutationFn: () => api.post(`/suppliers/${id}/payment`, { ...payment, amount: Number(payment.amount) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['supplier-ledger'] }); toast.success('Payment recorded'); setShowPayment(false); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const supp = data?.supplier;
  const entries = data?.data || [];
  const pages = Math.ceil((data?.total || 0) / 50);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <Link href="/suppliers"><a className="btn-secondary btn-sm"><ArrowLeft size={14} />Back</a></Link>
        <div><h1 className="page-title">{supp?.name || 'Supplier'} - Ledger</h1><p className="text-gray-500 text-sm">{supp?.phone}</p></div>
      </div>
      {supp && (
        <div className="grid grid-cols-2 gap-4">
          <div className="kpi-card"><div><p className="text-xs text-gray-500">Opening Balance</p><p className="text-lg font-bold">{fmtCurrency(supp.openingBalance || 0)}</p></div></div>
          <div className="kpi-card"><div><p className="text-xs text-gray-500">Current Balance</p><p className={`text-lg font-bold ${supp.currentBalance > 0 ? 'text-orange-600' : 'text-green-600'}`}>{fmtCurrency(Math.abs(supp.currentBalance))} {supp.currentBalance > 0 ? 'Payable' : 'Advance'}</p></div></div>
        </div>
      )}
      <div className="card">
        <div className="card-header"><h3 className="font-semibold">Ledger Entries</h3><button onClick={() => setShowPayment(true)} className="btn-success btn-sm"><Plus size={14} />Record Payment</button></div>
        <div className="table-container"><table className="table"><thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={6} className="text-center py-10 text-gray-400">Loading...</td></tr> :
             entries.length === 0 ? <tr><td colSpan={6} className="text-center py-10 text-gray-400">No entries</td></tr> :
             entries.map((e: any) => (
              <tr key={e.id}>
                <td>{fmtDate(e.entryDate)}</td>
                <td>{e.description}</td>
                <td><span className={e.type === 'credit' ? 'badge-yellow' : 'badge-blue'}>{e.type}</span></td>
                <td className="text-blue-600">{e.type === 'debit' ? fmtCurrency(e.amount) : '-'}</td>
                <td className="text-orange-600">{e.type === 'credit' ? fmtCurrency(e.amount) : '-'}</td>
                <td className={`font-semibold ${e.balance > 0 ? 'text-orange-600' : 'text-green-600'}`}>{fmtCurrency(Math.abs(e.balance))}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {pages > 1 && <div className="px-5 py-3 border-t text-sm text-gray-500">Page {page} of {pages} <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="btn-secondary btn-sm ml-2">Next</button></div>}
      </div>
      {showPayment && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowPayment(false)}>
          <div className="modal modal-sm">
            <div className="flex items-center justify-between p-6 border-b"><h2 className="font-bold">Record Payment to Supplier</h2><button onClick={() => setShowPayment(false)}><X size={20} /></button></div>
            <div className="p-6 space-y-4">
              <div><label className="label">Amount (PKR)</label><input type="number" className="input" value={payment.amount} onChange={e => setPayment(p => ({ ...p, amount: e.target.value }))} /></div>
              <div><label className="label">Date</label><input type="date" className="input" value={payment.date} onChange={e => setPayment(p => ({ ...p, date: e.target.value }))} /></div>
              <div><label className="label">Description</label><input className="input" value={payment.description} onChange={e => setPayment(p => ({ ...p, description: e.target.value }))} /></div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t"><button onClick={() => setShowPayment(false)} className="btn-secondary">Cancel</button><button onClick={() => addPayment()} disabled={isPending || !payment.amount} className="btn-success">{isPending ? 'Saving...' : 'Record'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
