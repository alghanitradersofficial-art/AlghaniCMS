import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { fmtCurrency, fmtDate } from '../lib/utils';
import toast from 'react-hot-toast';
import { Plus, Search, Trash2, Edit2, X, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';

type Product = { id: number; name: string; sku: string; categoryName?: string; brandName?: string; costPrice: number; salePrice: number; currentStock: number; minStock: number; unit: string; oemNumber?: string; barcode?: string; createdAt: string };

function ProductModal({ product, cats, brands, onClose }: { product: Product | null; cats: any[]; brands: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(product ? { name: product.name, sku: product.sku, categoryId: '', brandId: '', costPrice: String(product.costPrice), salePrice: String(product.salePrice), currentStock: String(product.currentStock), minStock: String(product.minStock), unit: product.unit, oemNumber: product.oemNumber || '', barcode: product.barcode || '', createdAt: product.createdAt.slice(0,10) } : { name: '', sku: '', categoryId: '', brandId: '', costPrice: '0', salePrice: '0', currentStock: '0', minStock: '0', unit: 'pcs', oemNumber: '', barcode: '', createdAt: new Date().toISOString().slice(0,10) });

  const { mutate, isPending } = useMutation({
    mutationFn: () => product ? api.put(`/products/${product.id}`, { ...form, costPrice: Number(form.costPrice), salePrice: Number(form.salePrice), currentStock: Number(form.currentStock), minStock: Number(form.minStock), categoryId: Number(form.categoryId) || null, brandId: Number(form.brandId) || null }) : api.post('/products', { ...form, costPrice: Number(form.costPrice), salePrice: Number(form.salePrice), currentStock: Number(form.currentStock), minStock: Number(form.minStock), categoryId: Number(form.categoryId) || null, brandId: Number(form.brandId) || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast.success(product ? 'Updated' : 'Added'); onClose(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="flex items-center justify-between p-6 border-b"><h2 className="font-bold">{product ? 'Edit Product' : 'New Product'}</h2><button onClick={onClose}><X size={20} /></button></div>
        <div className="p-6 grid grid-cols-2 gap-4">
          <div className="col-span-2"><label className="label">Product Name</label><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
          <div><label className="label">SKU</label><input className="input" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} required /></div>
          <div><label className="label">Unit</label><select className="input" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}><option>pcs</option><option>kg</option><option>ltr</option><option>m</option><option>box</option><option>set</option></select></div>
          <div><label className="label">Category</label><select className="input" value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}><option value="">-- None --</option>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label className="label">Brand</label><select className="input" value={form.brandId} onChange={e => setForm(f => ({ ...f, brandId: e.target.value }))}><option value="">-- None --</option>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          <div><label className="label">Cost Price (PKR)</label><input type="number" className="input" value={form.costPrice} onChange={e => setForm(f => ({ ...f, costPrice: e.target.value }))} /></div>
          <div><label className="label">Sale Price (PKR)</label><input type="number" className="input" value={form.salePrice} onChange={e => setForm(f => ({ ...f, salePrice: e.target.value }))} /></div>
          <div><label className="label">Current Stock</label><input type="number" className="input" value={form.currentStock} onChange={e => setForm(f => ({ ...f, currentStock: e.target.value }))} /></div>
          <div><label className="label">Min Stock (Alert)</label><input type="number" className="input" value={form.minStock} onChange={e => setForm(f => ({ ...f, minStock: e.target.value }))} /></div>
          <div><label className="label">OEM Number</label><input className="input" value={form.oemNumber} onChange={e => setForm(f => ({ ...f, oemNumber: e.target.value }))} /></div>
          <div><label className="label">Barcode</label><input className="input" value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} /></div>
          {!product && <div className="col-span-2"><label className="label">Date Added (for historical data)</label><input type="date" className="input" value={form.createdAt} onChange={e => setForm(f => ({ ...f, createdAt: e.target.value }))} /></div>}
        </div>
        <div className="flex justify-end gap-3 p-6 border-t"><button onClick={onClose} className="btn-secondary">Cancel</button><button onClick={() => mutate()} disabled={isPending} className="btn-primary">{isPending ? 'Saving...' : 'Save Product'}</button></div>
      </div>
    </div>
  );
}

export default function Inventory() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editProd, setEditProd] = useState<Product | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['products', page, search, lowStock], queryFn: () => api.get(`/products?page=${page}&limit=20&search=${search}${lowStock ? '&lowStock=true' : ''}`).then(r => r.data) });
  const { data: cats } = useQuery({ queryKey: ['categories'], queryFn: () => api.get('/products/categories/all').then(r => r.data) });
  const { data: brandsList } = useQuery({ queryKey: ['brands'], queryFn: () => api.get('/products/brands/all').then(r => r.data) });
  const { mutate: del } = useMutation({ mutationFn: (id: number) => api.delete(`/products/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast.success('Deleted'); } });

  const products: Product[] = data?.data || [];
  const pages = Math.ceil((data?.total || 0) / 20);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="page-title">Inventory</h1><p className="text-gray-500 text-sm">{data?.total || 0} products</p></div>
        <button onClick={() => { setEditProd(null); setShowModal(true); }} className="btn-primary"><Plus size={16} />Add Product</button>
      </div>
      <div className="card">
        <div className="card-header flex-wrap gap-3">
          <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input className="input pl-9 w-72" placeholder="Search products..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer"><input type="checkbox" checked={lowStock} onChange={e => setLowStock(e.target.checked)} /><AlertTriangle size={14} className="text-red-500" />Low Stock Only</label>
        </div>
        <div className="table-container"><table className="table"><thead><tr><th>Name</th><th>SKU</th><th>Category</th><th>Cost</th><th>Price</th><th>Stock</th><th>Min</th><th>Actions</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={8} className="text-center py-10 text-gray-400">Loading...</td></tr> :
             products.length === 0 ? <tr><td colSpan={8} className="text-center py-10 text-gray-400">No products found</td></tr> :
             products.map(p => (
              <tr key={p.id}>
                <td className="font-medium">{p.name}</td>
                <td className="font-mono text-xs text-gray-500">{p.sku}</td>
                <td>{p.categoryName || '-'}</td>
                <td>{fmtCurrency(p.costPrice)}</td>
                <td className="text-blue-700 font-semibold">{fmtCurrency(p.salePrice)}</td>
                <td><span className={p.currentStock <= p.minStock ? 'badge-red' : 'badge-green'}>{p.currentStock} {p.unit}</span></td>
                <td className="text-gray-400">{p.minStock}</td>
                <td className="flex gap-1">
                  <button onClick={() => { setEditProd(p); setShowModal(true); }} className="btn-secondary btn-sm"><Edit2 size={13} /></button>
                  <button onClick={() => confirm('Delete?') && del(p.id)} className="btn-danger btn-sm"><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {pages > 1 && <div className="flex items-center justify-between px-5 py-3 border-t"><span className="text-sm text-gray-500">Page {page} of {pages}</span><div className="flex gap-2"><button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary btn-sm"><ChevronLeft size={14} /></button><button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="btn-secondary btn-sm"><ChevronRight size={14} /></button></div></div>}
      </div>
      {showModal && <ProductModal product={editProd} cats={cats || []} brands={brandsList || []} onClose={() => { setShowModal(false); setEditProd(null); }} />}
    </div>
  );
}
