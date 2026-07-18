import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGetProducts, useGetCustomers, useGetSuppliers } from "@workspace/api-client-react";
import { apiGet, apiPost } from "@/lib/api";
import { PriceHistoryPanel } from "@/components/price-history-panel";
import { SupplierPriceHistoryPanel } from "@/components/supplier-price-history-panel";
import { Zap, Plus, X, Info } from "lucide-react";

type EntryMode = "sale" | "purchase";

interface LineItem {
  key: string;
  productId: number | "";
  quantity: string;
  price: string;
}

const WALKIN = "__walkin__";

function newLineItem(): LineItem {
  return { key: Math.random().toString(36).slice(2), productId: "", quantity: "1", price: "0" };
}

export default function QuickEntry() {
  const [mode, setMode] = useState<EntryMode>("sale");
  const [items, setItems] = useState<LineItem[]>([newLineItem()]);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<number | undefined>(undefined);
  const [supplierId, setSupplierId] = useState<number | undefined>(undefined);
  const [entryDate, setEntryDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("completed");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: products } = useGetProducts({ limit: 100 });
  const { data: customers } = useGetCustomers({ limit: 100 });
  const { data: suppliers } = useGetSuppliers();

  const updateItem = (key: string, patch: Partial<LineItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };

  const addRow = () => setItems((prev) => [...prev, newLineItem()]);

  const removeRow = (key: string) => {
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((it) => it.key !== key)));
    if (expandedRow === key) setExpandedRow(null);
  };

  // Fetches the "suggested price" — the last price we sold at (to this
  // customer) or the last price we paid (to this supplier) — for a given
  // product, and fills it into that row.
  const applySuggestedPrice = async (key: string, productId: number, activeMode: EntryMode, activeCustomerId?: number, activeSupplierId?: number) => {
    try {
      if (activeMode === "sale") {
        if (!activeCustomerId) return;
        const suggestion = await apiGet<any>(`/api/customers/${activeCustomerId}/price-suggestion/${productId}`);
        const suggested = suggestion.previousCustomerPrice ?? suggestion.suggestedSellingPrice ?? 0;
        updateItem(key, { price: String(suggested) });
      } else {
        const product = products?.data.find((p) => p.id === productId);
        if (activeSupplierId) {
          const history = await apiGet<any>(`/api/suppliers/${activeSupplierId}/price-history/${productId}`);
          const suggested = history.hasHistory ? history.lastCostPrice : Number(product?.costPrice ?? 0);
          updateItem(key, { price: String(suggested ?? 0) });
        } else {
          updateItem(key, { price: String(Number(product?.costPrice ?? 0)) });
        }
      }
    } catch {
      // Leave price as-is; user can enter it manually.
    }
  };

  const handleProductChange = (key: string, productId: string) => {
    const id = Number(productId);
    updateItem(key, { productId: id, price: "0" });
    void applySuggestedPrice(key, id, mode, customerId, supplierId);
  };

  // Re-suggest prices for every row already filled in when the
  // customer/supplier changes, so the "last price with them" stays accurate.
  const refreshAllSuggestions = (activeMode: EntryMode, activeCustomerId?: number, activeSupplierId?: number) => {
    for (const item of items) {
      if (item.productId) void applySuggestedPrice(item.key, item.productId, activeMode, activeCustomerId, activeSupplierId);
    }
  };

  const handleCustomerChange = (value: string) => {
    const nextId = value === WALKIN ? undefined : Number(value);
    setCustomerId(nextId);
    refreshAllSuggestions("sale", nextId, undefined);
  };

  const handleSupplierChange = (value: string) => {
    const nextId = value === WALKIN ? undefined : Number(value);
    setSupplierId(nextId);
    refreshAllSuggestions("purchase", undefined, nextId);
  };

  const resetForm = () => {
    setItems([newLineItem()]);
    setExpandedRow(null);
    setCustomerId(undefined);
    setSupplierId(undefined);
    setNotes("");
  };

  const validItems = items.filter((it) => it.productId && Number(it.quantity) > 0);

  const handleSubmit = async () => {
    if (validItems.length === 0) {
      setMessage("Please add at least one product with a quantity.");
      return;
    }

    setSubmitting(true);
    setMessage("");
    let successCount = 0;
    const errors: string[] = [];

    // Each product becomes its own separate sale / purchase entry
    // (not one multi-item transaction).
    for (const item of validItems) {
      try {
        if (mode === "sale") {
          await apiPost("/api/sales", {
            customerId: customerId ?? undefined,
            customerName: customerId ? (customers?.data.find((c) => c.id === customerId)?.name ?? "") : "Walk-in customer",
            discount: 0,
            saleDate: entryDate || undefined,
            status: status || undefined,
            notes: notes || undefined,
            items: [{ productId: Number(item.productId), quantity: Number(item.quantity), unitPrice: Number(item.price || 0) }],
          });
        } else {
          await apiPost("/api/purchases", {
            supplierId: supplierId ?? undefined,
            supplierName: supplierId ? (suppliers?.find((s) => s.id === supplierId)?.name ?? "") : "Walk-in supplier",
            purchaseDate: entryDate || undefined,
            status: "received",
            notes: notes || undefined,
            items: [{ productId: Number(item.productId), quantity: Number(item.quantity), unitCost: Number(item.price || 0) }],
          });
        }
        successCount += 1;
      } catch (error) {
        const product = products?.data.find((p) => p.id === item.productId);
        errors.push(`${product?.name ?? "Product"}: ${error instanceof Error ? error.message : "failed"}`);
      }
    }

    if (errors.length === 0) {
      setMessage(`${successCount} ${mode === "sale" ? "sale" : "purchase"}${successCount > 1 ? "s" : ""} created successfully.`);
      resetForm();
    } else {
      setMessage(`${successCount} created, ${errors.length} failed — ${errors.join("; ")}`);
    }
    setSubmitting(false);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Zap className="w-6 h-6 text-primary" /> Quick Entry</h1>
          <p className="text-muted-foreground text-sm mt-1">Create a sale or purchase for multiple products at once, for fast day-to-day operations.</p>
        </div>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Fast transaction capture</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Entry type</Label>
                <Select value={mode} onValueChange={(value) => { setMode(value as EntryMode); setExpandedRow(null); }}>
                  <SelectTrigger className="bg-background/50 border-border"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="sale">Quick Sale</SelectItem>
                    <SelectItem value="purchase">Quick Purchase</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Entry date</Label>
                <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="bg-background/50 border-border" />
              </div>
            </div>

            {mode === "sale" ? (
              <div className="space-y-1">
                <Label>Customer</Label>
                <Select value={customerId ? String(customerId) : WALKIN} onValueChange={handleCustomerChange}>
                  <SelectTrigger className="bg-background/50 border-border"><SelectValue placeholder="Select a registered customer" /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {customers?.data.map((customer) => (
                      <SelectItem key={customer.id} value={String(customer.id)}>{customer.name} — {customer.phone}</SelectItem>
                    ))}
                    <SelectItem value={WALKIN}>Walk-in / Other (no khata tracking)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Full customer list is on the Customers tab — pick one here to pull their price history automatically.</p>
              </div>
            ) : (
              <div className="space-y-1">
                <Label>Supplier</Label>
                <Select value={supplierId ? String(supplierId) : WALKIN} onValueChange={handleSupplierChange}>
                  <SelectTrigger className="bg-background/50 border-border"><SelectValue placeholder="Select a registered supplier" /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {suppliers?.map((supplier) => (
                      <SelectItem key={supplier.id} value={String(supplier.id)}>{supplier.name}</SelectItem>
                    ))}
                    <SelectItem value={WALKIN}>Walk-in / Other (no khata tracking)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Full supplier list is on the Suppliers tab — pick one here to pull their price history automatically.</p>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Products</Label>
                <Button type="button" size="sm" variant="outline" onClick={addRow} className="h-7 gap-1 border-border text-xs"><Plus className="h-3 w-3" /> Add Product</Button>
              </div>

              {items.map((item) => (
                <div key={item.key} className="space-y-2 rounded-2xl border border-border/60 bg-background/60 p-2 sm:p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Select value={item.productId ? String(item.productId) : ""} onValueChange={(v) => handleProductChange(item.key, v)}>
                      <SelectTrigger className="h-9 flex-1 border-border bg-background/50 text-xs"><SelectValue placeholder="Select product" /></SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        {products?.data.map((product) => (
                          <SelectItem key={product.id} value={String(product.id)}>{product.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                      <Input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(item.key, { quantity: e.target.value })} placeholder="Qty" className="h-9 w-full border-border bg-background/50 text-xs sm:w-20" />
                      <Input type="number" min="0" value={item.price} onChange={(e) => updateItem(item.key, { price: e.target.value })} placeholder={mode === "sale" ? "Price" : "Cost"} className="h-9 w-full border-border bg-background/50 text-xs sm:w-28" />
                    </div>
                    <div className="flex items-center justify-between gap-2 sm:ml-auto">
                      <span className="w-20 text-right text-xs text-muted-foreground">Rs. {(Number(item.quantity || 0) * Number(item.price || 0)).toLocaleString()}</span>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setExpandedRow((prev) => (prev === item.key ? null : item.key))} className={`h-8 w-8 p-0 ${expandedRow === item.key ? "bg-primary/10 text-primary" : "hover:bg-accent"}`} title="Full price history">
                        <Info className="h-4 w-4" />
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => removeRow(item.key)} className="h-8 w-8 p-0 hover:bg-destructive/20 hover:text-destructive" disabled={items.length === 1}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {expandedRow === item.key && (
                    mode === "sale"
                      ? <PriceHistoryPanel customerId={customerId} productId={item.productId || undefined} proposedPrice={Number(item.price || 0)} />
                      : <SupplierPriceHistoryPanel supplierId={supplierId} productId={item.productId || undefined} />
                  )}
                </div>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v)}>
                  <SelectTrigger className="bg-background/50 border-border"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note" className="bg-background/50 border-border" />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background/30 p-3 text-sm text-muted-foreground">
              <p>
                {validItems.length} product{validItems.length === 1 ? "" : "s"} ready · Total: Rs. {validItems.reduce((sum, it) => sum + Number(it.quantity || 0) * Number(it.price || 0), 0).toLocaleString()}
                {" — each product will be saved as its own separate "}{mode === "sale" ? "sale" : "purchase"}.
              </p>
            </div>

            {message ? <p className="text-sm text-primary">{message}</p> : null}

            <Button onClick={handleSubmit} disabled={submitting} className="bg-primary hover:bg-primary/90">
              {submitting ? "Saving..." : `Create ${validItems.length || ""} ${mode === "sale" ? "sale" : "purchase"}${validItems.length === 1 ? "" : "s"}`}
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
