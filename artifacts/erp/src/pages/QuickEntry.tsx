import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { fmtCurrency } from '../lib/utils';
import toast from 'react-hot-toast';
import { Plus, Trash2, Zap, ShoppingCart, Truck, Receipt } from 'lucide-react';

type EntryType = 'sales' | 'purchases' | 'expenses';

interface SaleEntry { customerName: string; customerId: string; total: string; paidAmount: string; date: string; notes: string; items: { productName: string; quantity: string; unitPrice: string }[] }
interface PurchaseEntry { supplierName: string; supplierId: string; total: string; paidAmount: string; date: string; notes: string; items: { productName: string; quantity: string; unitCost: string }[] }
interface ExpenseEntry { title: string; category: string; amount: string; date: string; notes: string }

const todayStr = new Date().toISOString().slice(0, 10);
const newSaleEntry = (): SaleEntry => ({ customerName: '', customerId: '', total: '', paidAmount: '', date: todayStr, notes: '', items: [{ productName: '', quantity: '1', unitPrice: '0' }] });
const newPurchEntry = (): PurchaseEntry => ({ supplierName: '', supplierId: '', total: '', paidAmount: '', date: todayStr, notes: '', items: [{ productName: '', quantity: '1', unitCost: '0' }] });
const newExpEntry = (): ExpenseEntry => ({ title: '', category: 'Miscellaneous', amount: '', date: todayStr, notes: '' });

const EXPENSE_CATS = ['Rent', 'Utilities', 'Salaries', 'Transport', 'Maintenance', 'Marketing', 'Office', 'Miscellaneous'];

export default function QuickEntry() {
  const [tab, setTab] = useState<EntryType>('sales');
  const [saleEntries, setSaleEntries] = useState<SaleEntry[]>([newSaleEntry()]);
  const [purchEntries, setPurchEntries] = useState<PurchaseEntry[]>([newPurchEntry()]);
  const [expEntries, setExpEntries] = useState<ExpenseEntry[]>([newExpEntry()]);
  const [custSuggestions, setCustSuggestions] = useState<{ idx: number; results: any[] } | null>(null);
  const [suppSuggestions, setSuppSuggestions] = useState<{ idx: number; results: any[] } | null>(null);
  const qc = useQueryClient();

  const searchCustomers = async (q: string, idx: number) => {
    if (!q.trim()) { setCustSuggestions(null); return; }
    try { const { data } = await api.get(`/customers/suggestions?q=${q}`); setCustSuggestions({ idx, results: data }); } catch {}
  };

  const searchSuppliers = async (q: string, idx: number) => {
    if (!q.trim()) { setSuppSuggestions(null); return; }
    try { const { data } = await api.get(`/suppliers/suggestions?q=${q}`); setSuppSuggestions({ idx, results: data }); } catch {}
  };

  const calcSaleTotal = (e: SaleEntry) => e.items.reduce((a, i) => a + Number(i.quantity) * Number(i.unitPrice), 0);
  const calcPurchTotal = (e: PurchaseEntry) => e.items.reduce((a, i) => a + Number(i.quantity) * Number(i.unitCost), 0);

  const { mutate: saveSales, isPending: savingSales } = useMutation({
    mutationFn: () => api.post('/quick-entry/sales', { entries: saleEntries.map(e => ({ ...e, total: calcSaleTotal(e), paidAmount: Number(e.paidAmount) || calcSaleTotal(e), customerId: Number(e.customerId) || null, items: e.items.map(i => ({ productName: i.productName, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), total: Number(i.quantity) * Number(i.unitPrice) })) })) }),
    onSuccess: (d) => { toast.success(d.data.message); setSaleEntries([newSaleEntry()]); qc.invalidateQueries({ queryKey: ['sales'] }); qc.invalidateQueries({ queryKey: ['dashboard-summary'] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const { mutate: savePurch, isPending: savingPurch } = useMutation({
    mutationFn: () => api.post('/quick-entry/purchases', { entries: purchEntries.map(e => ({ ...e, total: calcPurchTotal(e), paidAmount: Number(e.paidAmount) || calcPurchTotal(e), supplierId: Number(e.supplierId) || null, items: e.items.map(i => ({ productName: i.productName, quantity: Number(i.quantity), unitCost: Number(i.unitCost), total: Number(i.quantity) * Number(i.unitCost) })) })) }),
    onSuccess: (d) => { toast.success(d.data.message); setPurchEntries([newPurchEntry()]); qc.invalidateQueries({ queryKey: ['purchases'] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const { mutate: saveExp, isPending: savingExp } = useMutation({
    mutationFn: () => api.post('/quick-entry/expenses', { entries: expEntries.map(e => ({ ...e, amount: Number(e.amount) })) }),
    onSuccess: (d) => { toast.success(d.data.message); setExpEntries([newExpEntry()]); qc.invalidateQueries({ queryKey: ['expenses'] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-yellow-500 rounded-xl flex items-center justify-center"><Zap size={20} className="text-white" /></div>
        <div><h1 className="page-title">Quick Entry</h1><p className="text-gray-500 text-sm">Enter multiple records at once with custom dates</p></div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {(['sales', 'purchases', 'expenses'] as EntryType[]).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === t ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'sales' ? <><ShoppingCart size={14} className="inline mr-1" />Sales</> : t === 'purchases' ? <><Truck size={14} className="inline mr-1" />Purchases</> : <><Receipt size={14} className="inline mr-1" />Expenses</>}
          </button>
        ))}
      </div>

      {/* Sales Tab */}
      {tab === 'sales' && (
        <div className="space-y-4">
          {saleEntries.map((entry, idx) => (
            <div key={idx} className="card border-l-4 border-l-blue-500">
              <div className="card-header py-3"><span className="font-semibold text-sm text-blue-700">Sale #{idx + 1}</span><button onClick={() => saleEntries.length > 1 && setSaleEntries(e => e.filter((_, i) => i !== idx))} className="btn-danger btn-sm"><Trash2 size={12} /></button></div>
              <div className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="relative">
                  <label className="label">Customer Name</label>
                  <input className="input" value={entry.customerName} onChange={e => { setSaleEntries(es => { const copy = [...es]; copy[idx] = { ...copy[idx], customerName: e.target.value, customerId: '' }; return copy; }); searchCustomers(e.target.value, idx); }} placeholder="Search or type name..." />
                  {custSuggestions?.idx === idx && custSuggestions.results.length > 0 && (
                    <div className="absolute z-10 w-full bg-white border rounded-lg shadow-lg mt-1">
                      {custSuggestions.results.map(c => <button key={c.id} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm" onClick={() => { setSaleEntries(es => { const copy = [...es]; copy[idx] = { ...copy[idx], customerName: c.name, customerId: String(c.id) }; return copy; }); setCustSuggestions(null); }}>{c.name} — {c.phone}</button>)}
                    </div>
                  )}
                </div>
                <div><label className="label">Date</label><input type="date" className="input" value={entry.date} onChange={e => setSaleEntries(es => { const copy = [...es]; copy[idx] = { ...copy[idx], date: e.target.value }; return copy; })} /></div>
                <div><label className="label">Paid Amount (PKR)</label><input type="number" className="input" value={entry.paidAmount} placeholder={String(calcSaleTotal(entry))} onChange={e => setSaleEntries(es => { const copy = [...es]; copy[idx] = { ...copy[idx], paidAmount: e.target.value }; return copy; })} /></div>
                <div><label className="label">Notes</label><input className="input" value={entry.notes} onChange={e => setSaleEntries(es => { const copy = [...es]; copy[idx] = { ...copy[idx], notes: e.target.value }; return copy; })} /></div>
              </div>
              <div className="px-4 pb-4">
                <div className="flex items-center justify-between mb-2"><span className="text-xs font-semibold text-gray-500 uppercase">Items</span><button onClick={() => setSaleEntries(es => { const copy = [...es]; copy[idx] = { ...copy[idx], items: [...copy[idx].items, { productName: '', quantity: '1', unitPrice: '0' }] }; return copy; })} className="btn-secondary btn-sm"><Plus size={12} />Add Item</button></div>
                <div className="space-y-2">
                  {entry.items.map((item, ii) => (
                    <div key={ii} className="grid grid-cols-4 gap-2 items-center">
                      <input className="input col-span-2" value={item.productName} onChange={e => setSaleEntries(es => { const copy = [...es]; const items = [...copy[idx].items]; items[ii] = { ...items[ii], productName: e.target.value }; copy[idx] = { ...copy[idx], items }; return copy; })} placeholder="Product name" />
                      <input type="number" className="input" value={item.quantity} onChange={e => setSaleEntries(es => { const copy = [...es]; const items = [...copy[idx].items]; items[ii] = { ...items[ii], quantity: e.target.value }; copy[idx] = { ...copy[idx], items }; return copy; })} placeholder="Qty" />
                      <div className="flex gap-1 items-center">
                        <input type="number" className="input" value={item.unitPrice} onChange={e => setSaleEntries(es => { const copy = [...es]; const items = [...copy[idx].items]; items[ii] = { ...items[ii], unitPrice: e.target.value }; copy[idx] = { ...copy[idx], items }; return copy; })} placeholder="Price" />
                        {entry.items.length > 1 && <button onClick={() => setSaleEntries(es => { const copy = [...es]; copy[idx] = { ...copy[idx], items: copy[idx].items.filter((_, i) => i !== ii) }; return copy; })} className="text-red-400 hover:text-red-600"><Trash2 size={13} /></button>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-right mt-2 font-bold text-blue-700">Total: {fmtCurrency(calcSaleTotal(entry))}</div>
              </div>
            </div>
          ))}
          <div className="flex gap-3">
            <button onClick={() => setSaleEntries(e => [...e, newSaleEntry()])} className="btn-secondary"><Plus size={14} />Add Another Sale</button>
            <button onClick={() => saveSales()} disabled={savingSales} className="btn-primary"><Zap size={14} />{savingSales ? 'Saving...' : `Save ${saleEntries.length} Sale(s)`}</button>
          </div>
        </div>
      )}

      {/* Purchases Tab */}
      {tab === 'purchases' && (
        <div className="space-y-4">
          {purchEntries.map((entry, idx) => (
            <div key={idx} className="card border-l-4 border-l-orange-500">
              <div className="card-header py-3"><span className="font-semibold text-sm text-orange-700">Purchase #{idx + 1}</span><button onClick={() => purchEntries.length > 1 && setPurchEntries(e => e.filter((_, i) => i !== idx))} className="btn-danger btn-sm"><Trash2 size={12} /></button></div>
              <div className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="relative">
                  <label className="label">Supplier Name</label>
                  <input className="input" value={entry.supplierName} onChange={e => { setPurchEntries(es => { const copy = [...es]; copy[idx] = { ...copy[idx], supplierName: e.target.value, supplierId: '' }; return copy; }); searchSuppliers(e.target.value, idx); }} placeholder="Search or type name..." />
                  {suppSuggestions?.idx === idx && suppSuggestions.results.length > 0 && (
                    <div className="absolute z-10 w-full bg-white border rounded-lg shadow-lg mt-1">
                      {suppSuggestions.results.map(s => <button key={s.id} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm" onClick={() => { setPurchEntries(es => { const copy = [...es]; copy[idx] = { ...copy[idx], supplierName: s.name, supplierId: String(s.id) }; return copy; }); setSuppSuggestions(null); }}>{s.name} — {s.phone}</button>)}
                    </div>
                  )}
                </div>
                <div><label className="label">Date</label><input type="date" className="input" value={entry.date} onChange={e => setPurchEntries(es => { const copy = [...es]; copy[idx] = { ...copy[idx], date: e.target.value }; return copy; })} /></div>
                <div><label className="label">Paid Amount (PKR)</label><input type="number" className="input" value={entry.paidAmount} placeholder={String(calcPurchTotal(entry))} onChange={e => setPurchEntries(es => { const copy = [...es]; copy[idx] = { ...copy[idx], paidAmount: e.target.value }; return copy; })} /></div>
                <div><label className="label">Notes</label><input className="input" value={entry.notes} onChange={e => setPurchEntries(es => { const copy = [...es]; copy[idx] = { ...copy[idx], notes: e.target.value }; return copy; })} /></div>
              </div>
              <div className="px-4 pb-4">
                <div className="flex items-center justify-between mb-2"><span className="text-xs font-semibold text-gray-500 uppercase">Items</span><button onClick={() => setPurchEntries(es => { const copy = [...es]; copy[idx] = { ...copy[idx], items: [...copy[idx].items, { productName: '', quantity: '1', unitCost: '0' }] }; return copy; })} className="btn-secondary btn-sm"><Plus size={12} />Add Item</button></div>
                <div className="space-y-2">
                  {entry.items.map((item, ii) => (
                    <div key={ii} className="grid grid-cols-4 gap-2 items-center">
                      <input className="input col-span-2" value={item.productName} onChange={e => setPurchEntries(es => { const copy = [...es]; const items = [...copy[idx].items]; items[ii] = { ...items[ii], productName: e.target.value }; copy[idx] = { ...copy[idx], items }; return copy; })} placeholder="Product name" />
                      <input type="number" className="input" value={item.quantity} onChange={e => setPurchEntries(es => { const copy = [...es]; const items = [...copy[idx].items]; items[ii] = { ...items[ii], quantity: e.target.value }; copy[idx] = { ...copy[idx], items }; return copy; })} placeholder="Qty" />
                      <div className="flex gap-1 items-center">
                        <input type="number" className="input" value={item.unitCost} onChange={e => setPurchEntries(es => { const copy = [...es]; const items = [...copy[idx].items]; items[ii] = { ...items[ii], unitCost: e.target.value }; copy[idx] = { ...copy[idx], items }; return copy; })} placeholder="Cost" />
                        {entry.items.length > 1 && <button onClick={() => setPurchEntries(es => { const copy = [...es]; copy[idx] = { ...copy[idx], items: copy[idx].items.filter((_, i) => i !== ii) }; return copy; })} className="text-red-400 hover:text-red-600"><Trash2 size={13} /></button>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-right mt-2 font-bold text-orange-700">Total: {fmtCurrency(calcPurchTotal(entry))}</div>
              </div>
            </div>
          ))}
          <div className="flex gap-3">
            <button onClick={() => setPurchEntries(e => [...e, newPurchEntry()])} className="btn-secondary"><Plus size={14} />Add Another Purchase</button>
            <button onClick={() => savePurch()} disabled={savingPurch} className="btn-primary"><Zap size={14} />{savingPurch ? 'Saving...' : `Save ${purchEntries.length} Purchase(s)`}</button>
          </div>
        </div>
      )}

      {/* Expenses Tab */}
      {tab === 'expenses' && (
        <div className="space-y-4">
          {expEntries.map((entry, idx) => (
            <div key={idx} className="card border-l-4 border-l-red-500">
              <div className="card-header py-3"><span className="font-semibold text-sm text-red-700">Expense #{idx + 1}</span><button onClick={() => expEntries.length > 1 && setExpEntries(e => e.filter((_, i) => i !== idx))} className="btn-danger btn-sm"><Trash2 size={12} /></button></div>
              <div className="p-4 grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="col-span-2 lg:col-span-1"><label className="label">Title</label><input className="input" value={entry.title} onChange={e => setExpEntries(es => { const copy = [...es]; copy[idx] = { ...copy[idx], title: e.target.value }; return copy; })} placeholder="Expense title" /></div>
                <div><label className="label">Category</label><select className="input" value={entry.category} onChange={e => setExpEntries(es => { const copy = [...es]; copy[idx] = { ...copy[idx], category: e.target.value }; return copy; })}>{EXPENSE_CATS.map(c => <option key={c}>{c}</option>)}</select></div>
                <div><label className="label">Amount (PKR)</label><input type="number" className="input" value={entry.amount} onChange={e => setExpEntries(es => { const copy = [...es]; copy[idx] = { ...copy[idx], amount: e.target.value }; return copy; })} /></div>
                <div><label className="label">Date</label><input type="date" className="input" value={entry.date} onChange={e => setExpEntries(es => { const copy = [...es]; copy[idx] = { ...copy[idx], date: e.target.value }; return copy; })} /></div>
                <div><label className="label">Notes</label><input className="input" value={entry.notes} onChange={e => setExpEntries(es => { const copy = [...es]; copy[idx] = { ...copy[idx], notes: e.target.value }; return copy; })} /></div>
              </div>
            </div>
          ))}
          <div className="flex gap-3">
            <button onClick={() => setExpEntries(e => [...e, newExpEntry()])} className="btn-secondary"><Plus size={14} />Add Another Expense</button>
            <button onClick={() => saveExp()} disabled={savingExp} className="btn-primary"><Zap size={14} />{savingExp ? 'Saving...' : `Save ${expEntries.length} Expense(s)`}</button>
          </div>
        </div>
      )}
    </div>
  );
}
