import { useState } from "react";
import { useLocation } from "wouter";
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
import { Plus, Search, Truck, X, Edit, Trash2, Info } from "lucide-react";
import Confirm from "@/components/ui/confirm";
import { SupplierPriceHistoryPanel } from "@/components/supplier-price-history-panel";
import { apiDelete } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type LineItem = { productId: number; productName: string; quantity: number; unitCost: number; };

export default function Purchases() {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [supplierName, setSupplierName] = useState("");
  const [supplierId, setSupplierId] = useState<number | undefined>(undefined);
  const [poNumber, setPoNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [amountPaidNow, setAmountPaidNow] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [items, setItems] = useState<LineItem[]>([]);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<NonNullable<typeof data>['data'][0] | null>(null);
  const [editPoNumber, setEditPoNumber] = useState("");
  const [editStatus, setEditStatus] = useState<"pending" | "received" | "cancelled">("pending");
  const [editNotes, setEditNotes] = useState("");
  const [editItems, setEditItems] = useState<LineItem[]>([]);
  const [editPurchaseDate, setEditPurchaseDate] = useState("");
  const [editExpandedRow, setEditExpandedRow] = useState<number | null>(null);

  const { data, isLoading, refetch: refetchPurchases } = useGetPurchases({ search: search || undefined, status: statusFilter as "pending" | "received" | "cancelled" | undefined, page, limit: 20 });
  const { data: products } = useGetProducts({ limit: 100 });
  const { data: suppliers } = useGetSuppliers();
  const createPurchase = useCreatePurchase();
  const updatePurchase = useUpdatePurchase();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetPurchasesQueryKey(), exact: false });
    refetchPurchases();
  };

  const openNew = () => {
    setSupplierName(""); setSupplierId(undefined); setPoNumber(""); setNotes(""); setPurchaseDate(new Date().toISOString().slice(0, 10)); setAmountPaidNow("0"); setPaymentMethod("cash"); setItems([]); setExpandedRow(null); setOpen(true);
  };

  const addItem = () => {
    if (products?.data[0]) {
      const p = products.data[0];
      setItems(prev => [...prev, { productId: p.id, productName: p.name, quantity: 1, unitCost: p.costPrice }]);
    }
  };

  const updateItem = (idx: number, field: keyof LineItem, val: string | number) => {
    setItems(prev => {
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

  const total = items.reduce((s, i) => s + i.quantity * i.unitCost, 0);

  const handleSave = async () => {
    try {
      await createPurchase.mutateAsync({
        data: {
          supplierName,
          notes: notes || undefined,
          items: items.map(i => ({ productId: i.productId, quantity: i.quantity, unitCost: i.unitCost })),
          // supplierId links this PO to a real supplier record so it posts to
          // their ledger/khata; poNumber is respected as typed (falls back to
          // auto-generated only if left blank); purchaseDate enables
          // backdated entry; cash paid now only applies to khata suppliers
          // (ad-hoc/no-supplier purchases are always treated as fully paid).
          // All accepted by the backend but not yet part of the generated type.
          ...({
            supplierId,
            poNumber: poNumber || undefined,
            purchaseDate: new Date(purchaseDate).toISOString(),
            ...(supplierId ? { amountPaidNow: parseFloat(amountPaidNow || "0"), paymentMethod } : {}),
          } as {}),
        }
      });
      invalidate();
      setOpen(false);
      toast({ title: "Purchase created", description: "The new purchase order has been added." });
    } catch (e: any) {
      toast({ title: "Could not create purchase", description: e?.message || "Something went wrong.", variant: "destructive" });
    }
  };

  const handleStatusUpdate = async (id: number, status: "pending" | "received" | "cancelled") => {
    try {
      await updatePurchase.mutateAsync({ id, data: { status } });
      invalidate();
    } catch (e: any) {
      toast({ title: "Could not change status", description: e?.message || "Something went wrong.", variant: "destructive" });
    }
  };

  const statusColor = (s: string) => s === "received" ? "bg-green-500/10 text-green-400 border-0" : s === "pending" ? "bg-yellow-500/10 text-yellow-400 border-0" : "bg-red-500/10 text-red-400 border-0";

  const openEditPurchase = (purchase: NonNullable<typeof data>['data'][0]) => {
    setEditingPurchase(purchase);
    setEditPoNumber(purchase.poNumber || "");
    setEditStatus(purchase.status);
    setEditNotes(purchase.notes || "");
    setEditItems((purchase.items as any[]).map(i => ({ productId: i.productId, productName: i.productName, quantity: i.quantity, unitCost: i.unitCost })) || []);
    setEditPurchaseDate(((purchase as any).purchaseDate || purchase.createdAt).slice(0, 10));
    setEditExpandedRow(null);
    setEditOpen(true);
  };

  const updateEditItem = (idx: number, field: keyof LineItem, val: string | number) => {
    setEditItems(prev => {
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

  const handleSavePurchaseEdit = async () => {
    if (!editingPurchase) return;
    try {
      await updatePurchase.mutateAsync({
        id: editingPurchase.id,
        data: {
          status: editStatus,
          notes: editNotes || undefined,
          items: editItems.map(i => ({ productId: i.productId, quantity: i.quantity, unitCost: i.unitCost })),
          ...({
            poNumber: editPoNumber || undefined,
            purchaseDate: new Date(editPurchaseDate).toISOString(),
          } as {}),
        } as any
      });
      invalidate();
      setEditOpen(false);
      setEditingPurchase(null);
      toast({ title: "Purchase updated", description: "Changes have been saved." });
    } catch (e: any) {
      toast({ title: "Could not save changes", description: e?.message || "Something went wrong.", variant: "destructive" });
    }
  };

  const handleDeletePurchase = async (id: number) => {
    try {
      await apiDelete(`/api/purchases/${id}`);
      invalidate();
    } catch (e: any) {
      toast({ title: "Could not delete purchase", description: e?.message || "Something went wrong.", variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl"><Truck className="h-5 w-5 text-primary sm:h-6 sm:w-6" /> Purchase Orders</h1>
            <p className="mt-1 text-sm text-muted-foreground">{data?.total || 0} orders total</p>
          </div>
          <Button onClick={openNew} className="w-full gap-2 bg-primary hover:bg-primary/90 sm:w-auto"><Plus className="h-4 w-4" /> New Purchase</Button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search PO #, supplier, or product..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="border-border bg-card pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-full bg-card border-border sm:w-44"><SelectValue placeholder="All Status" /></SelectTrigger>
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
            <div className="space-y-3 p-3">
              {isLoading ? (
                <div className="rounded-2xl border border-border/60 bg-background/70 p-6 text-center text-sm text-muted-foreground">Loading purchases...</div>
              ) : (data?.data || []).length === 0 ? (
                <div className="rounded-2xl border border-border/60 bg-background/70 p-6 text-center text-sm text-muted-foreground">No purchases found.</div>
              ) : (data?.data || []).map((purchase) => (
                <div
                  key={purchase.id}
                  onClick={() => setLocation(`/purchases/${purchase.id}`)}
                  className="cursor-pointer rounded-2xl border border-border/60 bg-background/70 p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-background"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">{purchase.poNumber}</div>
                        <Badge className={statusColor(purchase.status)}>{purchase.status}</Badge>
                      </div>
                      <div className="mt-2 truncate text-sm font-semibold">{purchase.supplierName}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>{new Date((purchase as any).purchaseDate ?? purchase.createdAt).toLocaleDateString()}</span>
                        <span className="font-semibold text-secondary">Rs. {Number(purchase.total).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end" onClick={(e) => e.stopPropagation()}>
                      <Select value={purchase.status} onValueChange={(v) => handleStatusUpdate(purchase.id, v as "pending" | "received" | "cancelled") }>
                        <SelectTrigger className="h-8 w-28 border-border bg-background/50 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="received">Received</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="ghost" onClick={() => openEditPurchase(purchase)} className="h-8 w-8 p-0 hover:bg-accent"><Edit className="h-4 w-4" /></Button>
                      <Confirm title="Delete this purchase?" description="Delete purchase order permanently?" onConfirm={() => handleDeletePurchase(purchase.id)} trigger={<Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:bg-destructive/20 hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {data && data.total > 20 && (
              <div className="flex flex-wrap justify-center gap-2 border-t border-border p-4">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="border-border">Prev</Button>
                <span className="flex items-center px-3 text-sm text-muted-foreground">Page {page} of {Math.ceil(data.total / 20)}</span>
                <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(data.total / 20)} className="border-border">Next</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader><DialogTitle>New Purchase Order</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">PO Number *</Label>
              <Input value={poNumber} onChange={e => setPoNumber(e.target.value)} className="bg-background/50 border-border" placeholder="PO-001" />
            </div>

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
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Line Items</Label>
                <Button size="sm" variant="outline" onClick={addItem} className="h-7 gap-1 border-border text-xs"><Plus className="h-3 w-3" /> Add Item</Button>
              </div>
              {items.map((item, idx) => (
                <div key={idx} className="space-y-2 rounded-2xl border border-border/60 bg-background/60 p-2 sm:p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Select value={String(item.productId)} onValueChange={v => updateItem(idx, "productId", v)}>
                      <SelectTrigger className="h-9 flex-1 border-border bg-background/50 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-card border-border">{products?.data.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                      <Input type="number" value={item.quantity} onChange={e => updateItem(idx, "quantity", e.target.value)} className="h-9 w-full border-border bg-background/50 text-xs sm:w-20" placeholder="Qty" min={1} />
                      <Input type="number" value={item.unitCost} onChange={e => updateItem(idx, "unitCost", e.target.value)} className="h-9 w-full border-border bg-background/50 text-xs sm:w-28" placeholder="Cost" />
                    </div>
                    <div className="flex items-center justify-between gap-2 sm:ml-auto">
                      <span className="w-20 text-right text-xs text-muted-foreground">Rs. {(item.quantity * item.unitCost).toLocaleString()}</span>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setExpandedRow(prev => prev === idx ? null : idx)} className={`h-8 w-8 p-0 ${expandedRow === idx ? "bg-primary/10 text-primary" : "hover:bg-accent"}`} title="Supplier price history"><Info className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => { setItems(prev => prev.filter((_, i) => i !== idx)); if (expandedRow === idx) setExpandedRow(null); }} className="h-8 w-8 p-0 hover:bg-destructive/20 hover:text-destructive"><X className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  {expandedRow === idx && (
                    <SupplierPriceHistoryPanel supplierId={supplierId} productId={item.productId} />
                  )}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
                <Input value={notes} onChange={e => setNotes(e.target.value)} className="bg-background/50 border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Purchase Date</Label>
                <Input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} className="bg-background/50 border-border" />
              </div>
            </div>

            {supplierId !== undefined && (
              <div className="space-y-2 rounded-2xl border border-border/60 bg-background/60 p-3">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Payment Made Now</Label>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" className="border-border text-xs" onClick={() => setAmountPaidNow(String(total))}>Full (Rs. {total.toLocaleString()})</Button>
                  <Button type="button" size="sm" variant="outline" className="border-border text-xs" onClick={() => setAmountPaidNow(String(Math.round(total / 2)))}>Half</Button>
                  <Button type="button" size="sm" variant="outline" className="border-border text-xs" onClick={() => setAmountPaidNow("0")}>None — Full Credit</Button>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input type="number" value={amountPaidNow} onChange={e => setAmountPaidNow(e.target.value)} className="bg-background/50 border-border" placeholder="Amount paid" />
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="bg-background/50 border-border sm:w-40"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="jazzcash">JazzCash</SelectItem>
                      <SelectItem value="easypaisa">Easypaisa</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  Remaining Rs. {Math.max(0, total - parseFloat(amountPaidNow || "0")).toLocaleString()} will stay on this supplier's khata (ledger) as credit. Only cash actually paid shows up in Cash-in-Hand.
                </p>
              </div>
            )}

            <div className="border-t border-border pt-3 text-right">
              <p className="text-lg font-bold text-secondary">Total: Rs. {total.toLocaleString()}</p>
            </div>
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setOpen(false)} className="border-border">Cancel</Button>
            <Button onClick={handleSave} disabled={!supplierName || !poNumber.trim() || items.length === 0 || createPurchase.isPending} className="bg-primary hover:bg-primary/90">Create PO</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) setEditingPurchase(null); }}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader><DialogTitle>Edit Purchase - {editingPurchase?.poNumber}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-2xl border border-border/60 bg-background/60 p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Supplier</p>
              <p className="font-semibold">{editingPurchase?.supplierName}</p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">PO Number *</Label>
              <Input value={editPoNumber} onChange={e => setEditPoNumber(e.target.value)} className="bg-background/50 border-border" placeholder="PO-001" />
            </div>

            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Line Items</Label>
                <Button size="sm" variant="outline" onClick={() => {
                  if (products?.data[0]) {
                    const p = products.data[0];
                    setEditItems(prev => [...prev, { productId: p.id, productName: p.name, quantity: 1, unitCost: p.costPrice }]);
                  }
                }} className="h-7 gap-1 border-border text-xs"><Plus className="h-3 w-3" /> Add Item</Button>
              </div>
              {editItems.map((item, idx) => (
                <div key={idx} className="space-y-2 rounded-2xl border border-border/60 bg-background/60 p-2 sm:p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Select value={String(item.productId)} onValueChange={v => updateEditItem(idx, "productId", v)}>
                      <SelectTrigger className="h-9 flex-1 border-border bg-background/50 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        {products?.data.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                      <Input type="number" value={item.quantity} onChange={e => updateEditItem(idx, "quantity", e.target.value)} className="h-9 w-full border-border bg-background/50 text-xs sm:w-20" placeholder="Qty" min={1} />
                      <Input type="number" value={item.unitCost} onChange={e => updateEditItem(idx, "unitCost", e.target.value)} className="h-9 w-full border-border bg-background/50 text-xs sm:w-28" placeholder="Cost" />
                    </div>
                    <div className="flex items-center justify-between gap-2 sm:ml-auto">
                      <span className="w-20 text-right text-xs text-muted-foreground">Rs. {(item.quantity * item.unitCost).toLocaleString()}</span>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setEditExpandedRow(prev => prev === idx ? null : idx)} className={`h-8 w-8 p-0 ${editExpandedRow === idx ? "bg-primary/10 text-primary" : "hover:bg-accent"}`} title="Supplier price history"><Info className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditItems(prev => prev.filter((_, i) => i !== idx)); if (editExpandedRow === idx) setEditExpandedRow(null); }} className="h-8 w-8 p-0 hover:bg-destructive/20 hover:text-destructive"><X className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  {editExpandedRow === idx && (
                    <SupplierPriceHistoryPanel supplierId={editingPurchase?.supplierId == null ? undefined : Number(editingPurchase.supplierId)} productId={item.productId} />
                  )}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Purchase Date</Label>
                <Input type="date" value={editPurchaseDate} onChange={e => setEditPurchaseDate(e.target.value)} className="bg-background/50 border-border" />
              </div>
              <div className="space-y-1 sm:col-span-2">
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
            </div>

            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
              <Input value={editNotes} onChange={e => setEditNotes(e.target.value)} className="bg-background/50 border-border" />
            </div>

            <div className="border-t border-border pt-3 text-right">
              <p className="text-lg font-bold text-secondary">Total: Rs. {editItems.reduce((s, i) => s + i.quantity * i.unitCost, 0).toLocaleString()}</p>
            </div>
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => { setEditOpen(false); setEditingPurchase(null); }} className="border-border">Cancel</Button>
            <Button onClick={handleSavePurchaseEdit} disabled={updatePurchase.isPending || !editPoNumber.trim() || editItems.length === 0} className="bg-primary hover:bg-primary/90">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
