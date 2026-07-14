import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { fmtCurrency, MONTH_NAMES } from '../lib/utils';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import { Lock, Unlock, X, AlertTriangle, CheckCircle, Calendar } from 'lucide-react';

const now = new Date();

export default function Operations() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selYear, setSelYear] = useState(now.getFullYear());
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1);
  const [closeModal, setCloseModal] = useState(false);
  const [notes, setNotes] = useState('');
  const [closeYearModal, setCloseYearModal] = useState(false);

  const { data } = useQuery({ queryKey: ['months'], queryFn: () => api.get('/months').then(r => r.data) });
  const { data: monthStatus } = useQuery({ queryKey: ['month-status', selYear, selMonth], queryFn: () => api.get(`/months/${selYear}/${selMonth}/status`).then(r => r.data) });

  const { mutate: closeMonth, isPending: closing } = useMutation({
    mutationFn: () => api.post('/months/close', { year: selYear, month: selMonth, notes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['months'] }); qc.invalidateQueries({ queryKey: ['month-status'] }); toast.success('Month closed successfully'); setCloseModal(false); setNotes(''); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const { mutate: reopenMonth, isPending: reopening } = useMutation({
    mutationFn: (id: number) => api.post(`/months/${id}/reopen`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['months'] }); qc.invalidateQueries({ queryKey: ['month-status'] }); toast.success('Month reopened'); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to reopen - insufficient permissions'),
  });

  const { mutate: closeYear, isPending: closingYear } = useMutation({
    mutationFn: () => api.post('/months/year/close', { year: selYear, notes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['months'] }); toast.success('Year closed'); setCloseYearModal(false); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const { mutate: reopenYear } = useMutation({
    mutationFn: (id: number) => api.post(`/months/year/${id}/reopen`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['months'] }); toast.success('Year reopened'); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const monthClosures = data?.months || [];
  const yearClosures = data?.years || [];
  const canReopen = user && ['ceo', 'developer', 'manager'].includes(user.role);
  const isClosed = monthStatus?.status === 'closed';

  const years = Array.from(new Set([now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2]));

  return (
    <div className="space-y-6">
      <div><h1 className="page-title">Month & Year Closing</h1><p className="text-gray-500 text-sm">Close periods to lock data. Reopen requires Manager/CEO permission.</p></div>

      {/* Month Selector */}
      <div className="card">
        <div className="card-header"><h3 className="font-semibold flex items-center gap-2"><Calendar size={18} />Monthly Period Close</h3></div>
        <div className="card-body space-y-5">
          <div className="flex flex-wrap gap-4 items-end">
            <div><label className="label">Year</label><select className="input w-32" value={selYear} onChange={e => setSelYear(Number(e.target.value))}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select></div>
            <div><label className="label">Month</label><select className="input w-40" value={selMonth} onChange={e => setSelMonth(Number(e.target.value))}>{MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select></div>
            <div className="flex items-center gap-2 pb-0.5">
              {isClosed ? (
                <span className="flex items-center gap-2 text-green-700 font-semibold"><CheckCircle size={18} className="text-green-500" />Month is Closed</span>
              ) : (
                <span className="flex items-center gap-2 text-blue-700 font-semibold"><Unlock size={18} />Month is Open</span>
              )}
            </div>
          </div>

          {monthStatus?.closure && (
            <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
              <div><p className="text-gray-500">Total Sales</p><p className="font-bold text-blue-700">{fmtCurrency(monthStatus.closure.totalSales)}</p></div>
              <div><p className="text-gray-500">Total Purchases</p><p className="font-bold text-orange-700">{fmtCurrency(monthStatus.closure.totalPurchases)}</p></div>
              <div><p className="text-gray-500">Total Expenses</p><p className="font-bold text-red-700">{fmtCurrency(monthStatus.closure.totalExpenses)}</p></div>
              <div><p className="text-gray-500">Net Profit</p><p className={`font-bold ${monthStatus.closure.netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtCurrency(monthStatus.closure.netProfit)}</p></div>
              {monthStatus.closure.closedBy && <div className="col-span-2"><p className="text-gray-500">Closed By</p><p className="font-medium">{monthStatus.closure.closedBy}</p></div>}
              {monthStatus.closure.notes && <div className="col-span-2"><p className="text-gray-500">Notes</p><p className="font-medium">{monthStatus.closure.notes}</p></div>}
            </div>
          )}

          <div className="flex gap-3">
            {!isClosed ? (
              <button onClick={() => setCloseModal(true)} className="btn-primary"><Lock size={15} />Close {MONTH_NAMES[selMonth - 1]} {selYear}</button>
            ) : (
              canReopen && monthStatus?.closure && (
                <button onClick={() => confirm('Reopen this month?') && reopenMonth(monthStatus.closure.id)} disabled={reopening} className="btn-secondary"><Unlock size={15} />{reopening ? 'Reopening...' : 'Reopen Month'}</button>
              )
            )}
          </div>
        </div>
      </div>

      {/* Month History Table */}
      <div className="card">
        <div className="card-header"><h3 className="font-semibold">Closure History</h3></div>
        <div className="table-container"><table className="table"><thead><tr><th>Year</th><th>Month</th><th>Status</th><th>Sales</th><th>Purchases</th><th>Net Profit</th><th>Closed By</th><th>Action</th></tr></thead>
          <tbody>
            {monthClosures.length === 0 ? <tr><td colSpan={8} className="text-center py-10 text-gray-400">No closures yet</td></tr> :
             monthClosures.map((m: any) => (
              <tr key={m.id}>
                <td>{m.year}</td>
                <td className="font-medium">{MONTH_NAMES[m.month - 1]}</td>
                <td><span className={m.status === 'closed' ? 'badge-green' : 'badge-blue'}>{m.status}</span></td>
                <td>{fmtCurrency(m.totalSales)}</td>
                <td>{fmtCurrency(m.totalPurchases)}</td>
                <td className={m.netProfit >= 0 ? 'text-green-700 font-semibold' : 'text-red-600 font-semibold'}>{fmtCurrency(m.netProfit)}</td>
                <td className="text-gray-500 text-xs">{m.closedBy || '-'}</td>
                <td>{m.status === 'closed' && canReopen ? <button onClick={() => confirm('Reopen?') && reopenMonth(m.id)} className="btn-secondary btn-sm"><Unlock size={12} />Reopen</button> : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      {/* Year Closures */}
      {(user?.role === 'ceo' || user?.role === 'developer') && (
        <div className="card">
          <div className="card-header"><h3 className="font-semibold flex items-center gap-2"><Lock size={16} className="text-red-500" />Annual Year Close (CEO/Developer Only)</h3>
            <button onClick={() => setCloseYearModal(true)} className="btn-danger btn-sm"><Lock size={13} />Close Year {selYear}</button>
          </div>
          <div className="table-container"><table className="table"><thead><tr><th>Year</th><th>Status</th><th>Sales</th><th>Net Profit</th><th>Closed By</th><th>Action</th></tr></thead>
            <tbody>
              {yearClosures.length === 0 ? <tr><td colSpan={6} className="text-center py-8 text-gray-400">No year closures yet</td></tr> :
               yearClosures.map((y: any) => (
                <tr key={y.id}>
                  <td className="font-bold">{y.year}</td>
                  <td><span className={y.status === 'closed' ? 'badge-green' : 'badge-blue'}>{y.status}</span></td>
                  <td>{fmtCurrency(y.totalSales)}</td>
                  <td className={y.netProfit >= 0 ? 'text-green-700 font-semibold' : 'text-red-600 font-semibold'}>{fmtCurrency(y.netProfit)}</td>
                  <td className="text-gray-500 text-xs">{y.closedBy || '-'}</td>
                  <td>{y.status === 'closed' ? <button onClick={() => confirm('Reopen year?') && reopenYear(y.id)} className="btn-secondary btn-sm"><Unlock size={12} />Reopen</button> : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {/* Close Month Modal */}
      {closeModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setCloseModal(false)}>
          <div className="modal modal-sm">
            <div className="flex items-center justify-between p-6 border-b"><h2 className="font-bold">Close {MONTH_NAMES[selMonth - 1]} {selYear}</h2><button onClick={() => setCloseModal(false)}><X size={20} /></button></div>
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <AlertTriangle size={20} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-800"><p className="font-semibold">This will lock all records for {MONTH_NAMES[selMonth - 1]} {selYear}</p><p className="mt-1">All sales, purchases, and expenses for this period will become read-only. You will need Manager/CEO permission to reopen.</p></div>
              </div>
              <div><label className="label">Notes (optional)</label><textarea className="input h-20 resize-none" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add any closing notes..." /></div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t"><button onClick={() => setCloseModal(false)} className="btn-secondary">Cancel</button><button onClick={() => closeMonth()} disabled={closing} className="btn-primary"><Lock size={14} />{closing ? 'Closing...' : 'Confirm Close'}</button></div>
          </div>
        </div>
      )}

      {/* Close Year Modal */}
      {closeYearModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setCloseYearModal(false)}>
          <div className="modal modal-sm">
            <div className="flex items-center justify-between p-6 border-b"><h2 className="font-bold text-red-700">Close Year {selYear}</h2><button onClick={() => setCloseYearModal(false)}><X size={20} /></button></div>
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4"><AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" /><p className="text-sm text-red-800 font-semibold">This will permanently close the entire year {selYear}. Only CEO/Developer can reopen.</p></div>
              <div><label className="label">Notes</label><textarea className="input h-20 resize-none" value={notes} onChange={e => setNotes(e.target.value)} /></div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t"><button onClick={() => setCloseYearModal(false)} className="btn-secondary">Cancel</button><button onClick={() => closeYear()} disabled={closingYear} className="btn-danger"><Lock size={14} />{closingYear ? 'Closing...' : 'Close Year'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
