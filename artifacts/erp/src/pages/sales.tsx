import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGetSales, useCreateSale, useUpdateSale, useDeleteSale, useGetProducts, useGetCustomers, getGetSalesQueryKey, getGetCustomersQueryKey } from "@workspace/api-client-react";
import { apiGet } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2, ShoppingCart, X, Info } from "lucide-react";
import Confirm from "@/components/ui/confirm";
import DataTable, { Column } from "@/components/ui/data-table";
import { PriceHistoryPanel } from "@/components/price-history-panel";
import { ReturnsClaimsPanel } from "@/components/returns-claims-panel";

type LineItem = { productId: number; productName: string; quantity: number; unitPrice: number; };

export default function Sales() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState<number | undefined>(undefined);
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("");
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10));
  const [amountReceived, setAmountReceived] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [items, setItems] = useState<LineItem[]>([]);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [editSaleOpen, setEditSaleOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<NonNullable<typeof data>['data'][0] | null>(null);
  const [editSaleStatus, setEditSaleStatus] = useState<"pending" | "completed" | "cancelled">("pending");
  const [editSaleNotes, setEditSaleNotes] = useState("");

  const { data, isLoading } = useGetSales({ search: search || undefined, status: statusFilter as "pending" | "completed" | "cancelled" | undefined, page, limit: 20 });
  const { data: products } = useGetProducts({ limit: 100 });
  const { data: customers } = useGetCustomers({ limit: 100 });
  const createSale = useCreateSale();
  const updateSale = useUpdateSale();
  const deleteSale = useDeleteSale();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetSalesQueryKey(), exact: false });
    // Customer totalSpent/totalOrders are computed from sales, so the
    // customers list must also refresh whenever a sale is created/edited/deleted.
    qc.invalidateQueries({ queryKey: getGetCustomersQueryKey(), exact: false });
  };

  const openNew = () => {
    setCustomerName(""); setCustomerId(undefined); setDiscount("0"); setNotes(""); setSaleDate(new Date().toISOString().slice(0, 10)); setAmountReceived("0"); setPaymentMethod("cash"); setItems([]); setEditingSale(null); setExpandedRow(null); setOpen(true);
  };

  const addItem = () => {
    if (products?.data[0]) {
      const p = products.data[0];
      setItems(prev => [...prev, { productId: p.id, productName: p.name, quantity: 1, unitPrice: 0 }]);
    }
  };

  const updateItem = (idx: number, field: keyof LineItem, val: string | number) => {
    setItems(prev => {
      const next = [...prev];
      if (field === "productId") {
        const product = products?.data.find(p => p.id === Number(val));
        if (product) {
          // No fixed product sale price — price is set per customer per sale.
          // Suggest the customer's last price for this product (via price-suggestion
          // endpoint, which falls back to cost + minimum margin); otherwise leave at 0
          // for manual entry.
          next[idx] = { ...next[idx], productId: product.id, productName: product.name, unitPrice: 0 };
          (async () => {
            try {
              if (customerId) {
                const suggestion = await apiGet<any>(`/api/customers/${customerId}/price-suggestion/${product.id}`);
                const suggested = suggestion.previousCustomerPrice ?? suggestion.suggestedSellingPrice ?? 0;
                setItems(cur => {
                  const n = [...cur];
                  n[idx] = { ...n[idx], unitPrice: suggested };
                  return n;
                });
              }
            } catch (e) {
              // ignore and leave unitPrice as-is for manual entry
            }
          })();
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
        customerId,
        customerName,
        discount: parseFloat(discount || "0"),
        notes: notes || undefined,
        items: items.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice })),
        // saleDate/amountReceived/paymentMethod are accepted by the backend
        // but not yet part of the generated CreateSaleBody type. Cash
        // received now only applies to khata (registered) customers —
        // walk-in sales are always treated as fully paid.
        ...({
          saleDate: new Date(saleDate).toISOString(),
          ...(customerId ? { amountReceived: parseFloat(amountReceived || "0"), paymentMethod } : {}),
        } as {}),
      }
    });
    invalidate();
    setOpen(false);
  };

  const handleStatusUpdate = async (id: number, status: "pending" | "completed" | "cancelled") => {
    await updateSale.mutateAsync({ id, data: { status } });
    invalidate();
  };

  const openEditSale = (sale: NonNullable<typeof data>['data'][0]) => {
    setEditingSale(sale);
    setEditSaleStatus(sale.status);
    setEditSaleNotes(sale.notes || "");
    setEditSaleOpen(true);
  };

  const handleSaveSaleEdit = async () => {
    if (!editingSale) return;
    await updateSale.mutateAsync({ id: editingSale.id, data: { status: editSaleStatus, notes: editSaleNotes || undefined } });
    invalidate();
    setEditSaleOpen(false);
    setEditingSale(null);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this sale?")) return;
    await deleteSale.mutateAsync({ id }); invalidate();
  };

  const statusColor = (s: string) => s === "completed" ? "bg-green-500/10 text-green-400 border-0" : s === "pending" ? "bg-yellow-500/10 text-yellow-400 border-0" : "bg-red-500/10 text-red-400 border-0";

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl"><ShoppingCart className="h-5 w-5 text-primary sm:h-6 sm:w-6" /> Sales Orders</h1>
            <p className="mt-1 text-sm text-muted-foreground">{data?.total || 0} orders total</p>
          </div>
          <Button onClick={openNew} className="w-full gap-2 bg-primary hover:bg-primary/90 sm:w-auto"><Plus className="h-4 w-4" /> New Sale</Button>
        </div>

        <ReturnsClaimsPanel
          sales={(data?.data || []).map(s => ({
            id: s.id,
            invoiceNumber: s.invoiceNumber,
            customerId: s.customerId ?? undefined,
            customerName: s.customerName,
            items: ((s.items as any[]) || []).map((i: any) => ({ productId: i.productId, productName: i.productName, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) })),
          }))}
          products={(products?.data || []).map(p => ({ id: p.id, name: p.name, sku: p.sku, salePrice: p.salePrice ?? undefined }))}
          customers={(customers?.data || []).map(c => ({ id: c.id, name: c.name, phone: c.phone }))}
          onChanged={invalidate}
        />

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search customer..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="border-border bg-card pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-full bg-card border-border sm:w-44"><SelectValue placeholder="All Status" /></SelectTrigger>
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
            <div className="hidden md:block">
              <DataTable
                loading={isLoading}
                data={data?.data || []}
                columns={[
                  { key: 'invoiceNumber', title: 'Invoice', render: (r) => <span className="font-mono text-xs text-primary">{r.invoiceNumber}</span> },
                  { key: 'customerName', title: 'Customer', render: (r) => <span className="font-medium">{r.customerName}</span> },
                  { key: 'total', title: 'Total', align: 'right', render: (r) => <span className="font-semibold text-secondary">Rs. {Number(r.total).toLocaleString()}</span> },
                  { key: 'status', title: 'Status', align: 'center', render: (r) => (
                      <Select value={r.status} onValueChange={(v) => handleStatusUpdate(r.id, v as "pending" | "completed" | "cancelled") }>
                        <SelectTrigger className="h-7 w-32 border-0 bg-transparent p-0 text-xs">
                          <Badge className={statusColor(r.status)}>{r.status}</Badge>
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                  ) },
                  { key: 'saleDate', title: 'Date', render: (r) => new Date(((r as any).saleDate ?? r.createdAt)).toLocaleDateString() },
                  { key: 'actions', title: 'Actions', align: 'center', render: (r) => (
                    <div className="flex justify-center gap-2">
                      <Button size="sm" variant="ghost" onClick={() => openEditSale(r)} className="h-8 w-8 p-0 hover:bg-accent"><Edit className="h-4 w-4" /></Button>
                      <Confirm title="Delete this sale?" description="This will remove the sale record." onConfirm={() => handleDelete(r.id)} trigger={<Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:bg-destructive/20 hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>} />
                    </div>
                  ) },
                ]}
              />
            </div>

            <div className="space-y-3 p-3 md:hidden">
              {isLoading ? (
                <div className="rounded-2xl border border-border/60 bg-background/70 p-6 text-center text-sm text-muted-foreground">Loading sales...</div>
              ) : (data?.data || []).length === 0 ? (
                <div className="rounded-2xl border border-border/60 bg-background/70 p-6 text-center text-sm text-muted-foreground">No sales yet.</div>
              ) : (data?.data || []).map((sale) => (
                <div key={sale.id} className="rounded-2xl border border-border/60 bg-background/70 p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">{sale.invoiceNumber}</div>
                      <div className="mt-1 truncate text-sm font-semibold">{sale.customerName}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{new Date(((sale as any).saleDate ?? sale.createdAt)).toLocaleDateString()}</div>
                    </div>
                    <Badge className={statusColor(sale.status)}>{sale.status}</Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-secondary">Rs. {Number(sale.total).toLocaleString()}</div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => openEditSale(sale)} className="h-8 w-8 p-0 hover:bg-accent"><Edit className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(sale.id)} className="h-8 w-8 p-0 hover:bg-destructive/20 hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
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
          <DialogHeader><DialogTitle>New Sale Order</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Customer *</Label>
              <Select
                value={customerId ? String(customerId) : customerName ? "__walkin__" : ""}
                onValueChange={(v) => {
                  if (v === "__walkin__") { setCustomerId(undefined); setCustomerName(""); return; }
                  const c = customers?.data.find(c => c.id === Number(v));
                  if (c) { setCustomerId(c.id); setCustomerName(c.name); }
                }}
              >
                <SelectTrigger className="bg-background/50 border-border"><SelectValue placeholder="Select a registered customer" /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {customers?.data.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name} — {c.phone}</SelectItem>)}
                  <SelectItem value="__walkin__">Walk-in / Other (no khata tracking)</SelectItem>
                </SelectContent>
              </Select>
              {customerId === undefined && (
                <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Walk-in customer name" className="bg-background/50 border-border mt-1" />
              )}
              {customerId !== undefined && (
                <p className="text-xs text-muted-foreground">Price history + khata (ledger) will update automatically for this customer.</p>
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
                      <SelectContent className="bg-card border-border">
                        {products?.data.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                      <Input type="number" value={item.quantity} onChange={e => updateItem(idx, "quantity", e.target.value)} className="h-9 w-full border-border bg-background/50 text-xs sm:w-20" placeholder="Qty" min={1} />
                      <Input type="number" value={item.unitPrice} onChange={e => updateItem(idx, "unitPrice", e.target.value)} className="h-9 w-full border-border bg-background/50 text-xs sm:w-28" placeholder="Price" />
                    </div>
                    <div className="flex items-center justify-between gap-2 sm:ml-auto">
                      <span className="w-20 text-right text-xs text-muted-foreground">Rs. {(item.quantity * item.unitPrice).toLocaleString()}</span>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setExpandedRow(prev => prev === idx ? null : idx)} className={`h-8 w-8 p-0 ${expandedRow === idx ? "bg-primary/10 text-primary" : "hover:bg-accent"}`} title="Price history & suggestion"><Info className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => { setItems(prev => prev.filter((_, i) => i !== idx)); if (expandedRow === idx) setExpandedRow(null); }} className="h-8 w-8 p-0 hover:bg-destructive/20 hover:text-destructive"><X className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  {expandedRow === idx && (
                    <PriceHistoryPanel customerId={customerId} productId={item.productId} proposedPrice={item.unitPrice} />
                  )}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Discount (Rs.)</Label>
                <Input type="number" value={discount} onChange={e => setDiscount(e.target.value)} className="bg-background/50 border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Invoice Date</Label>
                <Input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} className="bg-background/50 border-border" />
              </div>
            </div>

            {customerId !== undefined && (
              <div className="space-y-2 rounded-2xl border border-border/60 bg-background/60 p-3">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Payment Received Now</Label>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" className="border-border text-xs" onClick={() => setAmountReceived(String(total))}>Full (Rs. {total.toLocaleString()})</Button>
                  <Button type="button" size="sm" variant="outline" className="border-border text-xs" onClick={() => setAmountReceived(String(Math.round(total / 2)))}>Half</Button>
                  <Button type="button" size="sm" variant="outline" className="border-border text-xs" onClick={() => setAmountReceived("0")}>None — Full Udhaar</Button>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input type="number" value={amountReceived} onChange={e => setAmountReceived(e.target.value)} className="bg-background/50 border-border" placeholder="Amount received" />
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
                  Remaining Rs. {Math.max(0, total - parseFloat(amountReceived || "0")).toLocaleString()} will stay on this customer's khata (ledger) as udhaar. Only cash actually received shows up in Cash-in-Hand.
                </p>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} className="bg-background/50 border-border" />
            </div>

            <div className="border-t border-border pt-3 text-right space-y-1">
              <p className="text-sm text-muted-foreground">Subtotal: Rs. {subtotal.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">Discount: Rs. {parseFloat(discount || "0").toLocaleString()}</p>
              <p className="text-lg font-bold text-secondary">Total: Rs. {total.toLocaleString()}</p>
            </div>
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setOpen(false)} className="border-border">Cancel</Button>
            <Button onClick={handleSave} disabled={!customerName || items.length === 0 || createSale.isPending} className="bg-primary hover:bg-primary/90">Create Sale</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

        <Dialog open={editSaleOpen} onOpenChange={(open) => { setEditSaleOpen(open); if (!open) setEditingSale(null); }}>
          <DialogContent className="bg-card border-border max-w-md">
            <DialogHeader><DialogTitle>Edit Sale</DialogTitle></DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Status</Label>
                <Select value={editSaleStatus} onValueChange={v => setEditSaleStatus(v as "pending" | "completed" | "cancelled") }>
                  <SelectTrigger className="bg-background/50 border-border"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
                <Input value={editSaleNotes} onChange={e => setEditSaleNotes(e.target.value)} className="bg-background/50 border-border" />
              </div>
            </div>
            <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => { setEditSaleOpen(false); setEditingSale(null); }} className="border-border">Cancel</Button>
              <Button onClick={handleSaveSaleEdit} disabled={updateSale.isPending} className="bg-primary hover:bg-primary/90">Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </Layout>
  );
}
