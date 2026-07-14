import React, { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGetPurchases, useCreatePurchase, useUpdatePurchase, useGetProducts, useGetSuppliers, getGetPurchasesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Truck, X, Edit, Trash2 } from "lucide-react";
import DataTable from "@/components/ui/data-table";
import { apiDelete } from "@/lib/api";

type LineItem = { productId: number; productName: string; quantity: number; unitCost: number; };

export default function Purchases() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [supplierName, setSupplierName] = useState("");
  const [supplierId, setSupplierId] = useState<number | undefined>(undefined);
  const [notes, setNotes] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<LineItem[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editPurchaseId, setEditPurchaseId] = useState<number | null>(null);
  const [editStatus, setEditStatus] = useState<"pending" | "received" | "cancelled">("pending");
  const [editNotes, setEditNotes] = useState("");
  const [editPurchaseDate, setEditPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [editItems, setEditItems] = useState<LineItem[]>([]);

  const { data, isLoading } = useGetPurchases({ search: search || undefined, status: statusFilter as "pending" | "received" | "cancelled" | undefined, page, limit: 20 });
  const { data: products } = useGetProducts({ limit: 100 });
  const { data: suppliers } = useGetSuppliers();
  const createPurchase = useCreatePurchase();
  const updatePurchase = useUpdatePurchase();

  const invalidate = () => qc.invalidateQueries({ queryKey: getGetPurchasesQueryKey() });

  const openNew = () => { setSupplierName(""); setSupplierId(undefined); setNotes(""); setPurchaseDate(new Date().toISOString().slice(0, 10)); setItems([]); setOpen(true); };

  const addItemTo = (setter: React.Dispatch<React.SetStateAction<LineItem[]>>) => {
    if (products?.data[0]) {
      const p = products.data[0];
      setter(prev => [...prev, { productId: p.id, productName: p.name, quantity: 1, unitCost: p.costPrice }]);
    }
  };
  const addItem = () => addItemTo(setItems);
  const addEditItem = () => addItemTo(setEditItems);

  const updateItemIn = (setter: React.Dispatch<React.SetStateAction<LineItem[]>>, idx: number, field: keyof LineItem, val: string | number) => {
    setter(prev => {
      const next = [...prev];
      if (field === "productId") {
        const product = products?.data.find(p => p.id === Number(val));
        if (product) next[idx] = { ...next[idx], productId: product.id, productName: product.name, unitCost: product.costPrice };
      } else {
        next[idx] = { ...next[idx], [field]: Number(val) };
      }
      return next;
    });
  };
  const updateItem = (idx: number, field: keyof LineItem, val: string | number) => updateItemIn(setItems, idx, field, val);
  const updateEditItem = (idx: number, field: keyof LineItem, val: string | number) => updateItemIn(setEditItems, idx, field, val);

  const total = items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
  const editTotal = editItems.reduce((s, i) => s + i.quantity * i.unitCost, 0);

  const handleSave = async () => {
    try {
      await createPurchase.mutateAsync({
        data: {
          supplierName,
          notes: notes || undefined,
          items: items.map(i => ({ productId: i.productId, quantity: i.quantity, unitCost: i.unitCost })),
          // supplierId links this PO to a real supplier record so it posts to
          // their ledger/khata; purchaseDate enables backdated entry. Both are
          // accepted by the backend but not yet part of the generated type.
          ...({ supplierId, purchaseDate: new Date(purchaseDate).toISOString() } as {}),
        }
      });
      invalidate(); setOpen(false);
    } catch (error: any) {
      alert(error?.message || "Failed to create purchase. If this date is in a closed month, reopen the month first from the Months page.");
    }
  };

  const handleStatusUpdate = async (id: number, status: "pending" | "received" | "cancelled") => {
    await updatePurchase.mutateAsync({ id, data: { status } }); invalidate();
  };

  const statusColor = (s: string) => s === "received" ? "bg-green-500/10 text-green-400 border-0" : s === "pending" ? "bg-yellow-500/10 text-yellow-400 border-0" : "bg-red-500/10 text-red-400 border-0";

  const openEditPurchase = (purchase: NonNullable<typeof data>['data'][0]) => {
    setEditPurchaseId(purchase.id);
    setEditStatus(purchase.status);
    setEditNotes(purchase.notes || "");
    setEditPurchaseDate((purchase.purchaseDate ?? purchase.createdAt).slice(0, 10));
    setEditItems(purchase.items.map(i => ({ productId: i.productId, productName: i.productName, quantity: i.quantity, unitCost: i.unitCost })));
    setEditOpen(true);
  };

  const handleSavePurchaseEdit = async () => {
    if (!editPurchaseId) return;
    try {
      await updatePurchase.mutateAsync({
        id: editPurchaseId,
        data: {
          status: editStatus,
          notes: editNotes || undefined,
          items: editItems.map(i => ({ productId: i.productId, quantity: i.quantity, unitCost: i.unitCost })),
          ...({ purchaseDate: new Date(editPurchaseDate).toISOString() } as {}),
        },
      });
      invalidate();
      setEditOpen(false);
      setEditPurchaseId(null);
    } catch (error: any) {
      alert(error?.message || "Failed to update purchase. If this PO is in a closed month, reopen the month first from the Months page.");
    }
  };

  const handleDeletePurchase = async (id: number) => {
    if (!confirm("Delete this purchase?")) return;
    try {
      await apiDelete(`/api/purchases/${id}`);
      invalidate();
    } catch (error: any) {
      alert(error?.message || "Failed to delete purchase. If this PO is in a closed month, reopen the month first from the Months page.");
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Truck className="w-6 h-6 text-primary" /> Purchase Orders</h1>
            <p className="text-muted-foreground text-sm mt-1">{data?.total || 0} orders total</p>
          </div>
          <Button onClick={openNew} className="bg-primary hover:bg-primary/90 gap-2"><Plus className="w-4 h-4" /> New Purchase</Button>
        </div>

        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search supplier..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9 bg-card border-border" />
          </div>
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-44 bg-card border-border"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="received">Received</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="border-border bg-card">
          <CardContent className="p-0">
            <DataTable
              loading={isLoading}
              data={data?.data || []}
              columns={[
                { key: 'poNumber', title: 'PO Number', render: (r) => <span className="font-mono text-xs text-primary">{r.poNumber}</span> },
                { key: 'supplierName', title: 'Supplier', render: (r) => <span className="font-medium">{r.supplierName}</span> },
                { key: 'total', title: 'Total', align: 'right', render: (r) => <span className="font-semibold text-secondary">Rs. {Number(r.total).toLocaleString()}</span> },
                { key: 'status', title: 'Status', align: 'center', render: (r) => (
                  <Select value={r.status} onValueChange={(v) => handleStatusUpdate(r.id, v as "pending" | "received" | "cancelled") }>
                    <SelectTrigger className="w-32 h-7 text-xs border-0 p-0 bg-transparent">
                      <Badge className={statusColor(r.status)}>{r.status}</Badge>
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="received">Received</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                ) },
                { key: 'purchaseDate', title: 'Date', render: (r) => new Date(r.purchaseDate ?? r.createdAt).toLocaleDateString() },
                { key: 'actions', title: 'Actions', align: 'center', render: (r) => (
                  <div className="flex gap-2 justify-center">
                    <Button size="sm" variant="ghost" onClick={() => openEditPurchase(r)} className="hover:bg-accent w-8 h-8 p-0"><Edit className="w-4 h-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDeletePurchase(r.id)} className="hover:bg-destructive/20 hover:text-destructive w-8 h-8 p-0"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ) },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Purchase Order</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Supplier *</Label>
              <Select
                value={supplierId ? String(supplierId) : supplierName ? "__adhoc__" : ""}
                onValueChange={(v) => {
                  if (v === "__adhoc__") { setSupplierId(undefined); return; }
                  const s = suppliers?.find(s => s.id === Number(v));
                  if (s) { setSupplierId(s.id); setSupplierName(s.name); }
                }}
              >
                <SelectTrigger className="bg-background/50 border-border"><SelectValue placeholder="Select a registered supplier" /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {suppliers?.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name} — {s.phone}</SelectItem>)}
                  <SelectItem value="__adhoc__">One-off / Other (no khata tracking)</SelectItem>
                </SelectContent>
              </Select>
              {supplierId === undefined && (
                <Input value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="Supplier name" className="bg-background/50 border-border mt-1" />
              )}
              {supplierId !== undefined && (
                <p className="text-xs text-muted-foreground">This purchase will post to the supplier's ledger (khata) automatically.</p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Items</Label>
                <Button size="sm" variant="outline" onClick={addItem} className="border-border gap-1 h-7 text-xs"><Plus className="w-3 h-3" /> Add Item</Button>
              </div>
              {items.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Select value={String(item.productId)} onValueChange={v => updateItem(idx, "productId", v)}>
                    <SelectTrigger className="flex-1 bg-background/50 border-border text-xs h-9"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-card border-border">{products?.data.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input type="number" value={item.quantity} onChange={e => updateItem(idx, "quantity", e.target.value)} className="w-20 bg-background/50 border-border h-9 text-xs" min={1} />
                  <Input type="number" value={item.unitCost} onChange={e => updateItem(idx, "unitCost", e.target.value)} className="w-28 bg-background/50 border-border h-9 text-xs" />
                  <span className="text-xs w-24 text-right text-muted-foreground">Rs. {(item.quantity * item.unitCost).toLocaleString()}</span>
                  <Button size="sm" variant="ghost" onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))} className="w-8 h-8 p-0 hover:bg-destructive/20 hover:text-destructive"><X className="w-4 h-4" /></Button>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
                <Input value={notes} onChange={e => setNotes(e.target.value)} className="bg-background/50 border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Purchase Date</Label>
                <Input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} className="bg-background/50 border-border" />
              </div>
            </div>
            <div className="border-t border-border pt-3 text-right">
              <p className="text-lg font-bold text-secondary">Total: Rs. {total.toLocaleString()}</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} className="border-border">Cancel</Button>
            <Button onClick={handleSave} disabled={!supplierName || items.length === 0 || createPurchase.isPending} className="bg-primary hover:bg-primary/90">Create PO</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) setEditPurchaseId(null); }}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Purchase Order</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Status</Label>
              <Select value={editStatus} onValueChange={v => setEditStatus(v as "pending" | "received" | "cancelled") }>
                <SelectTrigger className="bg-background/50 border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Items</Label>
                <Button size="sm" variant="outline" onClick={addEditItem} className="border-border gap-1 h-7 text-xs"><Plus className="w-3 h-3" /> Add Item</Button>
              </div>
              <p className="text-xs text-muted-foreground">Changing quantities or products here will automatically adjust stock and this supplier's ledger to match.</p>
              {editItems.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Select value={String(item.productId)} onValueChange={v => updateEditItem(idx, "productId", v)}>
                    <SelectTrigger className="flex-1 bg-background/50 border-border text-xs h-9"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-card border-border">{products?.data.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input type="number" value={item.quantity} onChange={e => updateEditItem(idx, "quantity", e.target.value)} className="w-20 bg-background/50 border-border h-9 text-xs" min={1} />
                  <Input type="number" value={item.unitCost} onChange={e => updateEditItem(idx, "unitCost", e.target.value)} className="w-28 bg-background/50 border-border h-9 text-xs" />
                  <span className="text-xs w-24 text-right text-muted-foreground">Rs. {(item.quantity * item.unitCost).toLocaleString()}</span>
                  <Button size="sm" variant="ghost" onClick={() => setEditItems(prev => prev.filter((_, i) => i !== idx))} className="w-8 h-8 p-0 hover:bg-destructive/20 hover:text-destructive"><X className="w-4 h-4" /></Button>
                </div>
              ))}
              {editItems.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No items — add at least one line item.</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
                <Input value={editNotes} onChange={e => setEditNotes(e.target.value)} className="bg-background/50 border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Purchase Date</Label>
                <Input type="date" value={editPurchaseDate} onChange={e => setEditPurchaseDate(e.target.value)} className="bg-background/50 border-border" />
              </div>
            </div>
            <div className="border-t border-border pt-3 text-right">
              <p className="text-lg font-bold text-secondary">Total: Rs. {editTotal.toLocaleString()}</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setEditOpen(false); setEditPurchaseId(null); }} className="border-border">Cancel</Button>
            <Button onClick={handleSavePurchaseEdit} disabled={updatePurchase.isPending || editItems.length === 0} className="bg-primary hover:bg-primary/90">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  </Layout>
  );
}
