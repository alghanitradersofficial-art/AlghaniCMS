import { useState } from "react";
import { useParams, Link } from "wouter";
import { useGetPurchase, useUpdatePurchase, useGetProducts, getGetPurchasesQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Edit, Plus, X, Info } from "lucide-react";
import { PageLoading } from "@/components/loading-state";
import { SupplierPriceHistoryPanel } from "@/components/supplier-price-history-panel";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type LineItem = { productId: number; productName: string; quantity: number; unitCost: number; };

export default function PurchaseDetail() {
  const params = useParams<{ id: string }>();
  const purchaseId = Number(params.id);
  const { data: purchase, isLoading, error, refetch } = useGetPurchase(purchaseId);
  const { data: products } = useGetProducts({ limit: 100 });
  const updatePurchase = useUpdatePurchase();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [editPoNumber, setEditPoNumber] = useState("");
  const [editItems, setEditItems] = useState<LineItem[]>([]);
  const [editStatus, setEditStatus] = useState<"pending" | "received" | "cancelled">("pending");
  const [editNotes, setEditNotes] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editExpandedRow, setEditExpandedRow] = useState<number | null>(null);

  if (isLoading) {
    return (
      <Layout>
        <PageLoading label="Loading purchase details" />
      </Layout>
    );
  }

  if (!purchase || error) {
    return (
      <Layout>
        <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center">
          <p className="text-lg font-semibold">Purchase not found</p>
          <p className="mt-2 text-sm text-muted-foreground">Please go back to the purchase list.</p>
          <Link href="/purchases">
            <Button className="mt-4">Back to Purchases</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const openEdit = () => {
    setEditPoNumber(purchase.poNumber || "");
    setEditItems((purchase.items as any[]).map(i => ({ productId: i.productId, productName: i.productName, quantity: i.quantity, unitCost: i.unitCost })) || []);
    setEditStatus(purchase.status as any);
    setEditNotes(purchase.notes || "");
    setEditDate(((purchase as any).purchaseDate || purchase.createdAt).slice(0, 10));
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

  const handleSaveEdit = async () => {
    try {
      await updatePurchase.mutateAsync({
        id: purchaseId,
        data: {
          status: editStatus,
          notes: editNotes || undefined,
          items: editItems.map(i => ({ productId: i.productId, quantity: i.quantity, unitCost: i.unitCost })),
          ...({
            poNumber: editPoNumber || undefined,
            purchaseDate: new Date(editDate).toISOString(),
          } as {}),
        } as any
      });
      qc.invalidateQueries({ queryKey: getGetPurchasesQueryKey(), exact: false });
      qc.invalidateQueries({ queryKey: [`/api/purchases/${purchaseId}`] });
      refetch();
      setEditOpen(false);
      toast({ title: "Purchase updated", description: "Changes have been saved." });
    } catch (e: any) {
      toast({ title: "Could not save changes", description: e?.message || "Something went wrong.", variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <Link href="/purchases">
              <Button variant="ghost" className="gap-2"><ArrowLeft className="w-4 h-4" /> Back</Button>
            </Link>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">Purchase {purchase.poNumber}</h1>
            <p className="text-sm text-muted-foreground">{purchase.supplierName} • Rs. {Number(purchase.total).toLocaleString()}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={purchase.status === "received" ? "bg-emerald-500/10 text-emerald-500" : purchase.status === "pending" ? "bg-yellow-500/10 text-yellow-500" : "bg-red-500/10 text-red-500"}>{purchase.status}</Badge>
            <Button onClick={openEdit} className="gap-2"><Edit className="w-4 h-4" /> Manual Edit</Button>
          </div>
        </div>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Purchase Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">PO Number</div>
                <div className="mt-2 font-medium">{purchase.poNumber}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Date</div>
                <div className="mt-2 font-medium">{new Date((purchase as any).purchaseDate ?? purchase.createdAt).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Supplier</div>
                <div className="mt-2 font-medium">{purchase.supplierName}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Status</div>
                <div className="mt-2 font-medium">{purchase.status}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Line Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {((purchase.items as any[]) || []).map((item, idx) => (
                <div key={idx} className="flex justify-between items-center p-3 bg-background/50 rounded-lg border border-border/50">
                  <div className="flex-1">
                    <p className="font-medium">{item.productName}</p>
                    <p className="text-xs text-muted-foreground">Qty: {item.quantity} × Rs. {Number(item.unitCost).toLocaleString()}</p>
                  </div>
                  <p className="font-semibold text-secondary">Rs. {(Number(item.quantity) * Number(item.unitCost)).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Purchase Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal:</span>
                <span>Rs. {Number(purchase.subtotal).toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t border-border pt-2">
                <span>Total:</span>
                <span className="text-secondary">Rs. {Number(purchase.total).toLocaleString()}</span>
              </div>
              {purchase.notes && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Notes</p>
                  <p className="mt-2 text-sm">{purchase.notes}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader><DialogTitle>Edit Purchase - {purchase?.poNumber}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-2xl border border-border/60 bg-background/60 p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Supplier</p>
              <p className="font-semibold">{purchase?.supplierName}</p>
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
                    <SupplierPriceHistoryPanel supplierId={purchase?.supplierId == null ? undefined : Number(purchase.supplierId)} productId={item.productId} />
                  )}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Purchase Date</Label>
                <Input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="bg-background/50 border-border" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Status</Label>
                <Select value={editStatus} onValueChange={v => setEditStatus(v as "pending" | "received" | "cancelled")}>
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
            <Button variant="outline" onClick={() => setEditOpen(false)} className="border-border">Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={updatePurchase.isPending || !editPoNumber.trim() || editItems.length === 0} className="bg-primary hover:bg-primary/90">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
