import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import DataTable from "@/components/ui/data-table";
import { apiGet, apiPost } from "@/lib/api";
import { RotateCcw, ShieldAlert, Plus, X, Truck, PackageCheck, CircleDollarSign, UserCheck } from "lucide-react";

type SaleSummary = {
  id: number;
  invoiceNumber: string;
  customerId?: number | null;
  customerName: string;
  items: Array<{ productId: number; productName: string; quantity: number; unitPrice: number }>;
};

type ProductOption = { id: number; name: string; sku?: string; salePrice?: number | null };
type CustomerOption = { id: number; name: string; phone?: string };
type SupplierOption = { id: number; name: string; phone?: string };

type SalesReturnRow = {
  id: number;
  invoiceNumber?: string | null;
  customerName: string;
  items: Array<{ productName: string; quantity: number; unitPrice: number; total: number }>;
  total: number;
  reason?: string | null;
  returnDate: string;
};

type ClaimRow = {
  id: number;
  invoiceNumber?: string | null;
  customerName: string;
  productName: string;
  quantity: number;
  totalValue: number;
  costPrice: number;
  supplierId?: number | null;
  supplierName?: string | null;
  status: "with_us" | "sent_to_supplier" | "resolved_replacement" | "resolved_credit" | "returned_to_customer";
  resolutionType?: string | null;
  reason?: string | null;
  receivedAt: string;
};

const statusLabel: Record<ClaimRow["status"], string> = {
  with_us: "With Us",
  sent_to_supplier: "Sent to Supplier",
  resolved_replacement: "Replacement Ready",
  resolved_credit: "Credited (Closed)",
  returned_to_customer: "Returned to Customer",
};

const statusColor: Record<ClaimRow["status"], string> = {
  with_us: "bg-yellow-500/10 text-yellow-400 border-0",
  sent_to_supplier: "bg-blue-500/10 text-blue-400 border-0",
  resolved_replacement: "bg-purple-500/10 text-purple-400 border-0",
  resolved_credit: "bg-green-500/10 text-green-400 border-0",
  returned_to_customer: "bg-green-500/10 text-green-400 border-0",
};

export function ReturnsClaimsPanel({
  sales,
  products,
  customers,
  onChanged,
}: {
  sales: SaleSummary[];
  products: ProductOption[];
  customers: CustomerOption[];
  onChanged?: () => void;
}) {
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [returns, setReturns] = useState<SalesReturnRow[]>([]);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [returnOpen, setReturnOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [supplierPickerFor, setSupplierPickerFor] = useState<ClaimRow | null>(null);
  const [resolvePickerFor, setResolvePickerFor] = useState<ClaimRow | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [returnsRes, claimsRes] = await Promise.all([
        apiGet<any>("/api/sales-returns?limit=50"),
        apiGet<any>("/api/claims?limit=50"),
      ]);
      setReturns((returnsRes?.data || []) as SalesReturnRow[]);
      setClaims((claimsRes?.data || []) as ClaimRow[]);
    } catch (e) {
      setReturns([]);
      setClaims([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    apiGet<SupplierOption[]>("/api/suppliers?limit=200").then((s) => setSuppliers(Array.isArray(s) ? s : (s as any)?.data || [])).catch(() => setSuppliers([]));
  }, []);

  const refresh = async () => { await loadAll(); onChanged?.(); };

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2 text-base"><RotateCcw className="h-4 w-4 text-primary" /> Returns &amp; Claims</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setReturnOpen(true)} className="gap-1 border-border text-xs"><RotateCcw className="h-3.5 w-3.5" /> Sale Return</Button>
          <Button size="sm" variant="outline" onClick={() => setClaimOpen(true)} className="gap-1 border-border text-xs"><ShieldAlert className="h-3.5 w-3.5" /> Claim (Damaged)</Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="claims">
          <TabsList>
            <TabsTrigger value="claims">Claims ({claims.length})</TabsTrigger>
            <TabsTrigger value="returns">Sale Returns ({returns.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="claims" className="mt-3">
            <DataTable
              loading={loading}
              data={claims}
              columns={[
                { key: "customerName", title: "Customer", render: (r: ClaimRow) => <span className="font-medium">{r.customerName}</span> },
                { key: "productName", title: "Product", render: (r: ClaimRow) => <span>{r.productName} × {r.quantity}</span> },
                { key: "totalValue", title: "Value", align: "right", render: (r: ClaimRow) => <span className="text-secondary font-semibold">Rs. {Number(r.totalValue).toLocaleString()}</span> },
                { key: "status", title: "Status", align: "center", render: (r: ClaimRow) => <Badge className={statusColor[r.status]}>{statusLabel[r.status]}</Badge> },
                { key: "actions", title: "Next Step", align: "center", render: (r: ClaimRow) => (
                  <div className="flex justify-center">
                    {r.status === "with_us" && (
                      <Button size="sm" variant="outline" className="h-7 gap-1 border-border text-xs" onClick={() => setSupplierPickerFor(r)}><Truck className="h-3.5 w-3.5" /> Send to Supplier</Button>
                    )}
                    {r.status === "sent_to_supplier" && (
                      <Button size="sm" variant="outline" className="h-7 gap-1 border-border text-xs" onClick={() => setResolvePickerFor(r)}><PackageCheck className="h-3.5 w-3.5" /> Resolve</Button>
                    )}
                    {r.status === "resolved_replacement" && (
                      <Button size="sm" variant="outline" className="h-7 gap-1 border-border text-xs" onClick={async () => { await apiPost(`/api/claims/${r.id}/return-to-customer`, {}); await refresh(); }}><UserCheck className="h-3.5 w-3.5" /> Give to Customer</Button>
                    )}
                    {(r.status === "resolved_credit" || r.status === "returned_to_customer") && (
                      <span className="text-xs text-muted-foreground">Closed</span>
                    )}
                  </div>
                ) },
              ]}
            />
          </TabsContent>

          <TabsContent value="returns" className="mt-3">
            <DataTable
              loading={loading}
              data={returns}
              columns={[
                { key: "invoiceNumber", title: "Invoice", render: (r: SalesReturnRow) => <span className="font-mono text-xs text-primary">{r.invoiceNumber || "Standalone"}</span> },
                { key: "customerName", title: "Customer" },
                { key: "items", title: "Items", render: (r: SalesReturnRow) => <span className="text-xs text-muted-foreground">{r.items.map(i => `${i.productName} ×${i.quantity}`).join(", ")}</span> },
                { key: "total", title: "Credited", align: "right", render: (r: SalesReturnRow) => <span className="text-secondary font-semibold">Rs. {Number(r.total).toLocaleString()}</span> },
                { key: "returnDate", title: "Date", render: (r: SalesReturnRow) => new Date(r.returnDate).toLocaleDateString() },
              ]}
            />
          </TabsContent>
        </Tabs>
      </CardContent>

      <SaleReturnDialog open={returnOpen} onOpenChange={setReturnOpen} sales={sales} products={products} customers={customers} onSaved={refresh} />
      <ClaimDialog open={claimOpen} onOpenChange={setClaimOpen} sales={sales} products={products} customers={customers} onSaved={refresh} />
      <SendToSupplierDialog claim={supplierPickerFor} suppliers={suppliers} onClose={() => setSupplierPickerFor(null)} onSaved={refresh} />
      <ResolveClaimDialog claim={resolvePickerFor} onClose={() => setResolvePickerFor(null)} onSaved={refresh} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sale Return dialog — either against a specific invoice (partial or full)
// or standalone (pick a customer + items directly).
// ---------------------------------------------------------------------------
function SaleReturnDialog({ open, onOpenChange, sales, products, customers, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; sales: SaleSummary[]; products: ProductOption[]; customers: CustomerOption[]; onSaved: () => void;
}) {
  const [mode, setMode] = useState<"invoice" | "standalone">("invoice");
  const [saleId, setSaleId] = useState<number | undefined>(undefined);
  const [customerId, setCustomerId] = useState<number | undefined>(undefined);
  const [customerName, setCustomerName] = useState("");
  const [items, setItems] = useState<Array<{ productId: number; productName: string; quantity: number; unitPrice: number; maxQty?: number }>>([]);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedSale = useMemo(() => sales.find(s => s.id === saleId), [sales, saleId]);

  useEffect(() => {
    if (!open) {
      setMode("invoice"); setSaleId(undefined); setCustomerId(undefined); setCustomerName("");
      setItems([]); setReason(""); setNotes("");
    }
  }, [open]);

  useEffect(() => {
    if (mode === "invoice" && selectedSale) {
      setItems(selectedSale.items.map(i => ({ productId: i.productId, productName: i.productName, quantity: 0, unitPrice: i.unitPrice, maxQty: i.quantity })));
    }
  }, [selectedSale, mode]);

  const addStandaloneItem = () => {
    const p = products[0];
    if (!p) return;
    setItems(prev => [...prev, { productId: p.id, productName: p.name, quantity: 1, unitPrice: p.salePrice || 0 }]);
  };

  const updateItem = (idx: number, field: string, value: string) => {
    setItems(prev => {
      const next = [...prev];
      if (field === "productId") {
        const p = products.find(pr => pr.id === Number(value));
        if (p) next[idx] = { ...next[idx], productId: p.id, productName: p.name, unitPrice: p.salePrice || 0 };
      } else {
        next[idx] = { ...next[idx], [field]: Number(value) };
      }
      return next;
    });
  };

  const usableItems = items.filter(i => i.quantity > 0);
  const total = usableItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const canSave = usableItems.length > 0 && (mode === "invoice" ? !!saleId : true) && !saving;

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiPost("/api/sales-returns", {
        saleId: mode === "invoice" ? saleId : undefined,
        customerId: mode === "invoice" ? (selectedSale?.customerId ?? undefined) : customerId,
        customerName: mode === "invoice" ? selectedSale?.customerName : (customerName || undefined),
        items: usableItems.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice })),
        reason: reason || undefined,
        notes: notes || undefined,
      });
      onOpenChange(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-xl max-h-[90vh] overflow-y-auto bg-card border-border">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><RotateCcw className="h-4 w-4" /> Sale Return</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={mode === "invoice" ? "default" : "outline"} className={mode === "invoice" ? "bg-primary" : "border-border"} onClick={() => setMode("invoice")}>Against Invoice</Button>
            <Button type="button" size="sm" variant={mode === "standalone" ? "default" : "outline"} className={mode === "standalone" ? "bg-primary" : "border-border"} onClick={() => setMode("standalone")}>Standalone</Button>
          </div>

          {mode === "invoice" ? (
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Invoice</Label>
              <Select value={saleId ? String(saleId) : ""} onValueChange={v => setSaleId(Number(v))}>
                <SelectTrigger className="bg-background/50 border-border"><SelectValue placeholder="Select invoice" /></SelectTrigger>
                <SelectContent className="bg-card border-border max-h-64">
                  {sales.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.invoiceNumber} — {s.customerName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Customer</Label>
              <Select value={customerId ? String(customerId) : "__none__"} onValueChange={v => { if (v === "__none__") { setCustomerId(undefined); return; } const c = customers.find(c => c.id === Number(v)); if (c) { setCustomerId(c.id); setCustomerName(c.name); } }}>
                <SelectTrigger className="bg-background/50 border-border"><SelectValue placeholder="Select customer (optional)" /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="__none__">Walk-in / No khata</SelectItem>
                  {customers.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name} — {c.phone}</SelectItem>)}
                </SelectContent>
              </Select>
              {!customerId && <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Customer name" className="bg-background/50 border-border mt-1" />}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Items to Return</Label>
              {mode === "standalone" && <Button size="sm" variant="outline" onClick={addStandaloneItem} className="h-7 gap-1 border-border text-xs"><Plus className="h-3 w-3" /> Add Item</Button>}
            </div>
            {items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 p-3 text-sm text-muted-foreground">
                {mode === "invoice" ? "Select an invoice to see its items." : "Add items to return."}
              </div>
            ) : items.map((item, idx) => (
              <div key={idx} className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/60 p-2 sm:flex-row sm:items-center">
                {mode === "invoice" ? (
                  <span className="flex-1 text-sm">{item.productName}</span>
                ) : (
                  <Select value={String(item.productId)} onValueChange={v => updateItem(idx, "productId", v)}>
                    <SelectTrigger className="h-9 flex-1 border-border bg-background/50 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {products.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <Input type="number" min={0} max={item.maxQty} value={item.quantity} onChange={e => updateItem(idx, "quantity", e.target.value)} className="h-9 w-full border-border bg-background/50 text-xs sm:w-24" placeholder="Qty" />
                <Input type="number" value={item.unitPrice} onChange={e => updateItem(idx, "unitPrice", e.target.value)} className="h-9 w-full border-border bg-background/50 text-xs sm:w-28" placeholder="Price" />
                {item.maxQty !== undefined && <span className="text-xs text-muted-foreground sm:w-16">of {item.maxQty}</span>}
                {mode === "standalone" && <Button size="sm" variant="ghost" onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))} className="h-8 w-8 p-0 hover:bg-destructive/20 hover:text-destructive"><X className="h-4 w-4" /></Button>}
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Reason</Label>
            <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. customer didn't like it" className="bg-background/50 border-border" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} className="bg-background/50 border-border" rows={2} />
          </div>

          <div className="border-t border-border pt-3 text-right">
            <p className="text-lg font-bold text-secondary">Credit back: Rs. {total.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Stock is added back automatically. Customer's khata is reduced by this amount.</p>
          </div>
        </div>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border">Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave} className="bg-primary hover:bg-primary/90">Save Return</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Claim dialog — Stage 1: damaged product received from customer.
// ---------------------------------------------------------------------------
function ClaimDialog({ open, onOpenChange, sales, products, customers, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; sales: SaleSummary[]; products: ProductOption[]; customers: CustomerOption[]; onSaved: () => void;
}) {
  const [saleId, setSaleId] = useState<number | undefined>(undefined);
  const [customerId, setCustomerId] = useState<number | undefined>(undefined);
  const [customerName, setCustomerName] = useState("");
  const [productId, setProductId] = useState<number | undefined>(undefined);
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("0");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedSale = useMemo(() => sales.find(s => s.id === saleId), [sales, saleId]);

  useEffect(() => {
    if (!open) {
      setSaleId(undefined); setCustomerId(undefined); setCustomerName("");
      setProductId(undefined); setQuantity("1"); setUnitPrice("0"); setReason(""); setNotes("");
    }
  }, [open]);

  useEffect(() => {
    if (selectedSale) {
      setCustomerId(selectedSale.customerId ?? undefined);
      setCustomerName(selectedSale.customerName);
    }
  }, [selectedSale]);

  const handleProductChange = (v: string) => {
    const id = Number(v);
    setProductId(id);
    if (selectedSale) {
      const line = selectedSale.items.find(i => i.productId === id);
      if (line) { setUnitPrice(String(line.unitPrice)); return; }
    }
    const p = products.find(p => p.id === id);
    setUnitPrice(String(p?.salePrice || 0));
  };

  const total = Number(quantity || 0) * Number(unitPrice || 0);
  const canSave = !!productId && Number(quantity) > 0 && !saving;

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiPost("/api/claims", {
        saleId,
        customerId,
        customerName: customerName || undefined,
        productId,
        quantity: Number(quantity),
        unitPrice: Number(unitPrice),
        reason: reason || undefined,
        notes: notes || undefined,
      });
      onOpenChange(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto bg-card border-border">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><ShieldAlert className="h-4 w-4" /> Claim — Damaged Product</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Invoice (optional)</Label>
            <Select value={saleId ? String(saleId) : "__none__"} onValueChange={v => setSaleId(v === "__none__" ? undefined : Number(v))}>
              <SelectTrigger className="bg-background/50 border-border"><SelectValue placeholder="Link to invoice (optional)" /></SelectTrigger>
              <SelectContent className="bg-card border-border max-h-64">
                <SelectItem value="__none__">No invoice / standalone</SelectItem>
                {sales.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.invoiceNumber} — {s.customerName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {!selectedSale && (
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Customer</Label>
              <Select value={customerId ? String(customerId) : "__none__"} onValueChange={v => { if (v === "__none__") { setCustomerId(undefined); return; } const c = customers.find(c => c.id === Number(v)); if (c) { setCustomerId(c.id); setCustomerName(c.name); } }}>
                <SelectTrigger className="bg-background/50 border-border"><SelectValue placeholder="Select customer (optional)" /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="__none__">Walk-in / No khata</SelectItem>
                  {customers.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name} — {c.phone}</SelectItem>)}
                </SelectContent>
              </Select>
              {!customerId && <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Customer name" className="bg-background/50 border-border mt-1" />}
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Product</Label>
            <Select value={productId ? String(productId) : ""} onValueChange={handleProductChange}>
              <SelectTrigger className="bg-background/50 border-border"><SelectValue placeholder="Select damaged product" /></SelectTrigger>
              <SelectContent className="bg-card border-border max-h-64">
                {(selectedSale ? products.filter(p => selectedSale.items.some(i => i.productId === p.id)) : products).map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Quantity</Label>
              <Input type="number" min={1} value={quantity} onChange={e => setQuantity(e.target.value)} className="bg-background/50 border-border" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Unit Value (Rs.)</Label>
              <Input type="number" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} className="bg-background/50 border-border" />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Reason</Label>
            <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. arrived cracked" className="bg-background/50 border-border" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} className="bg-background/50 border-border" rows={2} />
          </div>

          <div className="border-t border-border pt-3 text-right">
            <p className="text-lg font-bold text-secondary">Value: Rs. {total.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Stock goes down by {quantity || 0} now; customer's khata is credited this amount. You'll send it to the supplier next.</p>
          </div>
        </div>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border">Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave} className="bg-primary hover:bg-primary/90">Save Claim</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Stage 2: send an already-received claim to a supplier.
function SendToSupplierDialog({ claim, suppliers, onClose, onSaved }: {
  claim: ClaimRow | null; suppliers: SupplierOption[]; onClose: () => void; onSaved: () => void;
}) {
  const [supplierId, setSupplierId] = useState<number | undefined>(undefined);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setSupplierId(undefined); setNotes(""); }, [claim]);

  if (!claim) return null;

  const handleSave = async () => {
    if (!supplierId) return;
    setSaving(true);
    try {
      await apiPost(`/api/claims/${claim.id}/send-to-supplier`, { supplierId, notes: notes || undefined });
      onClose();
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!claim} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm bg-card border-border">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Truck className="h-4 w-4" /> Send to Supplier</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">{claim.productName} × {claim.quantity} — Rs. {Number(claim.totalValue).toLocaleString()}</p>
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Supplier</Label>
            <Select value={supplierId ? String(supplierId) : ""} onValueChange={v => setSupplierId(Number(v))}>
              <SelectTrigger className="bg-background/50 border-border"><SelectValue placeholder="Select supplier" /></SelectTrigger>
              <SelectContent className="bg-card border-border max-h-64">
                {suppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} className="bg-background/50 border-border" rows={2} />
          </div>
        </div>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} className="border-border">Cancel</Button>
          <Button onClick={handleSave} disabled={!supplierId || saving} className="bg-primary hover:bg-primary/90">Send</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Stage 3: resolve — replacement (stock +1) or credit (supplier ledger -amount).
function ResolveClaimDialog({ claim, onClose, onSaved }: {
  claim: ClaimRow | null; onClose: () => void; onSaved: () => void;
}) {
  const [resolutionType, setResolutionType] = useState<"replacement" | "credit">("replacement");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setResolutionType("replacement"); setNotes(""); }, [claim]);

  if (!claim) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiPost(`/api/claims/${claim.id}/resolve`, { resolutionType, notes: notes || undefined });
      onClose();
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!claim} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm bg-card border-border">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><PackageCheck className="h-4 w-4" /> Resolve Claim</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">{claim.productName} × {claim.quantity} — sent to {claim.supplierName}</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={resolutionType === "replacement" ? "default" : "outline"} className={`flex-1 gap-1 ${resolutionType === "replacement" ? "bg-primary" : "border-border"}`} onClick={() => setResolutionType("replacement")}><PackageCheck className="h-3.5 w-3.5" /> Replacement</Button>
            <Button type="button" size="sm" variant={resolutionType === "credit" ? "default" : "outline"} className={`flex-1 gap-1 ${resolutionType === "credit" ? "bg-primary" : "border-border"}`} onClick={() => setResolutionType("credit")}><CircleDollarSign className="h-3.5 w-3.5" /> Credit</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {resolutionType === "replacement"
              ? "A fresh unit comes back into stock. No effect on the supplier's ledger."
              : `The supplier's ledger is reduced by Rs. ${Number((claim.costPrice || 0) * claim.quantity).toLocaleString()} (what we paid them — not the customer sale price of Rs. ${Number(claim.totalValue).toLocaleString()}).`}
          </p>
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} className="bg-background/50 border-border" rows={2} />
          </div>
        </div>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} className="border-border">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90">Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
