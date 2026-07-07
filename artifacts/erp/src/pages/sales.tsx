import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGetSales, useCreateSale, useUpdateSale, useDeleteSale, useGetProducts, useGetCustomers, getGetSalesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2, ShoppingCart, X } from "lucide-react";

type LineItem = { productId: number; productName: string; quantity: number; unitPrice: number; };

export default function Sales() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);

  const { data, isLoading } = useGetSales({ search: search || undefined, status: statusFilter as "pending" | "completed" | "cancelled" | undefined, page, limit: 20 });
  const { data: products } = useGetProducts({ limit: 100 });
  const { data: customers } = useGetCustomers({ limit: 100 });
  const createSale = useCreateSale();
  const updateSale = useUpdateSale();
  const deleteSale = useDeleteSale();

  const invalidate = () => qc.invalidateQueries({ queryKey: getGetSalesQueryKey() });

  const openNew = () => {
    setCustomerName(""); setDiscount("0"); setNotes(""); setItems([]); setEditingId(null); setOpen(true);
  };

  const addItem = () => {
    if (products?.data[0]) {
      const p = products.data[0];
      setItems(prev => [...prev, { productId: p.id, productName: p.name, quantity: 1, unitPrice: p.salePrice }]);
    }
  };

  const updateItem = (idx: number, field: keyof LineItem, val: string | number) => {
    setItems(prev => {
      const next = [...prev];
      if (field === "productId") {
        const product = products?.data.find(p => p.id === Number(val));
        if (product) {
          next[idx] = { ...next[idx], productId: product.id, productName: product.name, unitPrice: product.salePrice };
        }
      } else {
        next[idx] = { ...next[idx], [field]: Number(val) };
      }
      return next;
    });
  };

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const total = subtotal - parseFloat(discount || "0");

  const handleSave = async () => {
    await createSale.mutateAsync({
      data: {
        customerName,
        discount: parseFloat(discount || "0"),
        notes: notes || undefined,
        items: items.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice })),
      }
    });
    invalidate();
    setOpen(false);
  };

  const handleStatusUpdate = async (id: number, status: "pending" | "completed" | "cancelled") => {
    await updateSale.mutateAsync({ id, data: { status } });
    invalidate();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this sale?")) return;
    await deleteSale.mutateAsync({ id }); invalidate();
  };

  const statusColor = (s: string) => s === "completed" ? "bg-green-500/10 text-green-400 border-0" : s === "pending" ? "bg-yellow-500/10 text-yellow-400 border-0" : "bg-red-500/10 text-red-400 border-0";

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ShoppingCart className="w-6 h-6 text-primary" /> Sales Orders</h1>
            <p className="text-muted-foreground text-sm mt-1">{data?.total || 0} orders total</p>
          </div>
          <Button onClick={openNew} className="bg-primary hover:bg-primary/90 gap-2"><Plus className="w-4 h-4" /> New Sale</Button>
        </div>

        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search customer..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9 bg-card border-border" />
          </div>
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-44 bg-card border-border"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="border-border bg-card">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground uppercase text-xs tracking-wider">
                    <th className="px-4 py-3 text-left">Invoice</th>
                    <th className="px-4 py-3 text-left">Customer</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Loading...</td></tr>
                    : data?.data.length === 0 ? <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No sales found</td></tr>
                    : data?.data.map(s => (
                      <tr key={s.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-primary">{s.invoiceNumber}</td>
                        <td className="px-4 py-3 font-medium">{s.customerName}</td>
                        <td className="px-4 py-3 text-right font-semibold text-secondary">Rs. {s.total?.toLocaleString()}</td>
                        <td className="px-4 py-3 text-center">
                          <Select value={s.status} onValueChange={(v) => handleStatusUpdate(s.id, v as "pending" | "completed" | "cancelled")}>
                            <SelectTrigger className="w-32 h-7 text-xs border-0 p-0 bg-transparent">
                              <Badge className={statusColor(s.status)}>{s.status}</Badge>
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border">
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(s.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-center">
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(s.id)} className="hover:bg-destructive/20 hover:text-destructive w-8 h-8 p-0"><Trash2 className="w-4 h-4" /></Button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {data && data.total > 20 && (
              <div className="flex justify-center gap-2 p-4 border-t border-border">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="border-border">Prev</Button>
                <span className="flex items-center px-3 text-sm text-muted-foreground">Page {page} of {Math.ceil(data.total / 20)}</span>
                <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(data.total / 20)} className="border-border">Next</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Sale Order</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Customer Name *</Label>
              <Input value={customerName} onChange={e => setCustomerName(e.target.value)} className="bg-background/50 border-border" list="customers-list" />
              <datalist id="customers-list">
                {customers?.data.map(c => <option key={c.id} value={c.name} />)}
              </datalist>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Line Items</Label>
                <Button size="sm" variant="outline" onClick={addItem} className="border-border gap-1 h-7 text-xs"><Plus className="w-3 h-3" /> Add Item</Button>
              </div>
              {items.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Select value={String(item.productId)} onValueChange={v => updateItem(idx, "productId", v)}>
                    <SelectTrigger className="flex-1 bg-background/50 border-border text-xs h-9"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {products?.data.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="number" value={item.quantity} onChange={e => updateItem(idx, "quantity", e.target.value)} className="w-20 bg-background/50 border-border h-9 text-xs" placeholder="Qty" min={1} />
                  <Input type="number" value={item.unitPrice} onChange={e => updateItem(idx, "unitPrice", e.target.value)} className="w-28 bg-background/50 border-border h-9 text-xs" placeholder="Price" />
                  <span className="text-xs w-24 text-right text-muted-foreground">Rs. {(item.quantity * item.unitPrice).toLocaleString()}</span>
                  <Button size="sm" variant="ghost" onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))} className="w-8 h-8 p-0 hover:bg-destructive/20 hover:text-destructive"><X className="w-4 h-4" /></Button>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Discount (Rs.)</Label>
                <Input type="number" value={discount} onChange={e => setDiscount(e.target.value)} className="bg-background/50 border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
                <Input value={notes} onChange={e => setNotes(e.target.value)} className="bg-background/50 border-border" />
              </div>
            </div>

            <div className="border-t border-border pt-3 text-right space-y-1">
              <p className="text-sm text-muted-foreground">Subtotal: Rs. {subtotal.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">Discount: Rs. {parseFloat(discount || "0").toLocaleString()}</p>
              <p className="text-lg font-bold text-secondary">Total: Rs. {total.toLocaleString()}</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} className="border-border">Cancel</Button>
            <Button onClick={handleSave} disabled={!customerName || items.length === 0 || createSale.isPending} className="bg-primary hover:bg-primary/90">Create Sale</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
