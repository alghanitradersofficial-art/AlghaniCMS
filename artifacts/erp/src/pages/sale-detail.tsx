import { useState } from "react";
import { useParams, Link } from "wouter";
import { useGetSale, useUpdateSale, useGetProducts } from "@workspace/api-client-react";
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
import { PriceHistoryPanel } from "@/components/price-history-panel";
import { useQueryClient } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

type LineItem = { productId: number; productName: string; quantity: number; unitPrice: number; };

export default function SaleDetail() {
  const params = useParams<{ id: string }>();
  const saleId = Number(params.id);
  const { data: sale, isLoading, error, refetch } = useGetSale(saleId);
  const { data: products } = useGetProducts({ limit: 100 });
  const updateSale = useUpdateSale();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editItems, setEditItems] = useState<LineItem[]>([]);
  const [editStatus, setEditStatus] = useState<"pending" | "completed" | "cancelled">("pending");
  const [editDiscount, setEditDiscount] = useState("0");
  const [editNotes, setEditNotes] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editExpandedRow, setEditExpandedRow] = useState<number | null>(null);

  if (isLoading) {
    return (
      <Layout>
        <PageLoading label="Loading sale details" />
      </Layout>
    );
  }

  if (!sale || error) {
    return (
      <Layout>
        <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center">
          <p className="text-lg font-semibold">Sale not found</p>
          <p className="mt-2 text-sm text-muted-foreground">Please go back to the sales list.</p>
          <Link href="/sales">
            <Button className="mt-4">Back to Sales</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const openEdit = () => {
    setEditItems((sale.items as any[]).map(i => ({ productId: i.productId, productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice })) || []);
    setEditStatus(sale.status as any);
    setEditDiscount(String(sale.discount || "0"));
    setEditNotes(sale.notes || "");
    setEditDate(((sale as any).saleDate || sale.createdAt).toISOString().slice(0, 10));
    setEditExpandedRow(null);
    setEditOpen(true);
  };

  const updateEditItem = (idx: number, field: keyof LineItem, val: string | number) => {
    setEditItems(prev => {
      const next = [...prev];
      if (field === "productId") {
        const product = products?.data.find(p => p.id === Number(val));
        if (product) {
          next[idx] = { ...next[idx], productId: product.id, productName: product.name, unitPrice: 0 };
          (async () => {
            try {
              if (sale?.customerId) {
                const suggestion = await apiGet<any>(`/api/customers/${sale.customerId}/price-suggestion/${product.id}`);
                const suggested = suggestion.previousCustomerPrice ?? suggestion.suggestedSellingPrice ?? 0;
                setEditItems(cur => {
                  const n = [...cur];
                  n[idx] = { ...n[idx], unitPrice: suggested };
                  return n;
                });
              }
            } catch (e) {
              // ignore
            }
          })();
        }
      } else {
        next[idx] = { ...next[idx], [field]: Number(val) };
      }
      return next;
    });
  };

  const handleSaveEdit = async () => {
    try {
      await updateSale.mutateAsync({
        id: saleId,
        data: {
          status: editStatus,
          notes: editNotes || undefined,
          discount: parseFloat(editDiscount || "0"),
          items: editItems.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice })),
          saleDate: new Date(editDate).toISOString(),
        } as any
      });
      qc.invalidateQueries({ queryKey: ["GetSale", saleId] });
      refetch();
      setEditOpen(false);
    } catch (e: any) {
      console.error("Save failed", e);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <Link href="/sales">
              <Button variant="ghost" className="gap-2"><ArrowLeft className="w-4 h-4" /> Back</Button>
            </Link>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">Sale {sale.invoiceNumber}</h1>
            <p className="text-sm text-muted-foreground">{sale.customerName} • Rs. {Number(sale.total).toLocaleString()}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={sale.status === "completed" ? "bg-emerald-500/10 text-emerald-500" : sale.status === "pending" ? "bg-yellow-500/10 text-yellow-500" : "bg-red-500/10 text-red-500"}>{sale.status}</Badge>
            <Button onClick={openEdit} className="gap-2"><Edit className="w-4 h-4" /> Manual Edit</Button>
          </div>
        </div>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Sale Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Invoice</div>
                <div className="mt-2 font-medium">{sale.invoiceNumber}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Date</div>
                <div className="mt-2 font-medium">{new Date(((sale as any).saleDate || sale.createdAt)).toLocaleDateString()}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Customer</div>
                <div className="mt-2 font-medium">{sale.customerName}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Status</div>
                <div className="mt-2 font-medium">{sale.status}</div>
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
              {((sale.items as any[]) || []).map((item, idx) => (
                <div key={idx} className="flex justify-between items-center p-3 bg-background/50 rounded-lg border border-border/50">
                  <div className="flex-1">
                    <p className="font-medium">{item.productName}</p>
                    <p className="text-xs text-muted-foreground">Qty: {item.quantity} × Rs. {Number(item.unitPrice).toLocaleString()}</p>
                  </div>
                  <p className="font-semibold text-secondary">Rs. {(Number(item.quantity) * Number(item.unitPrice)).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Invoice Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal:</span>
                <span>Rs. {Number(sale.subtotal).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Discount:</span>
                <span>Rs. {Number(sale.discount).toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t border-border pt-2">
                <span>Total:</span>
                <span className="text-secondary">Rs. {Number(sale.total).toLocaleString()}</span>
              </div>
              {sale.notes && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Notes</p>
                  <p className="mt-2 text-sm">{sale.notes}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader><DialogTitle>Edit Invoice - {sale?.invoiceNumber}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {/* Customer info */}
            <div className="rounded-2xl border border-border/60 bg-background/60 p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Customer</p>
              <p className="font-semibold">{sale?.customerName}</p>
            </div>

            {/* Line Items */}
            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Line Items</Label>
                <Button size="sm" variant="outline" onClick={() => {
                  if (products?.data[0]) {
                    const p = products.data[0];
                    setEditItems(prev => [...prev, { productId: p.id, productName: p.name, quantity: 1, unitPrice: 0 }]);
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
                      <Input type="number" value={item.unitPrice} onChange={e => updateEditItem(idx, "unitPrice", e.target.value)} className="h-9 w-full border-border bg-background/50 text-xs sm:w-28" placeholder="Price" />
                    </div>
                    <div className="flex items-center justify-between gap-2 sm:ml-auto">
                      <span className="w-20 text-right text-xs text-muted-foreground">Rs. {(item.quantity * item.unitPrice).toLocaleString()}</span>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setEditExpandedRow(prev => prev === idx ? null : idx)} className={`h-8 w-8 p-0 ${editExpandedRow === idx ? "bg-primary/10 text-primary" : "hover:bg-accent"}`} title="Price history & suggestion"><Info className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditItems(prev => prev.filter((_, i) => i !== idx)); if (editExpandedRow === idx) setEditExpandedRow(null); }} className="h-8 w-8 p-0 hover:bg-destructive/20 hover:text-destructive"><X className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  {editExpandedRow === idx && (
                    <PriceHistoryPanel customerId={sale?.customerId} productId={item.productId} proposedPrice={item.unitPrice} />
                  )}
                </div>
              ))}
            </div>

            {/* Discount, Date, Status */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Discount (Rs.)</Label>
                <Input type="number" value={editDiscount} onChange={e => setEditDiscount(e.target.value)} className="bg-background/50 border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Invoice Date</Label>
                <Input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="bg-background/50 border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Status</Label>
                <Select value={editStatus} onValueChange={v => setEditStatus(v as "pending" | "completed" | "cancelled")}>
                  <SelectTrigger className="bg-background/50 border-border"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
              <Input value={editNotes} onChange={e => setEditNotes(e.target.value)} className="bg-background/50 border-border" />
            </div>

            {/* Totals */}
            <div className="border-t border-border pt-3 text-right space-y-1">
              <p className="text-sm text-muted-foreground">Subtotal: Rs. {editItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0).toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">Discount: Rs. {parseFloat(editDiscount || "0").toLocaleString()}</p>
              <p className="text-lg font-bold text-secondary">Total: Rs. {(editItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0) - parseFloat(editDiscount || "0")).toLocaleString()}</p>
            </div>
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setEditOpen(false)} className="border-border">Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={updateSale.isPending || editItems.length === 0} className="bg-primary hover:bg-primary/90">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
