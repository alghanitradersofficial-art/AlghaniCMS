import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGetProducts, useGetCustomers, useGetSuppliers } from "@workspace/api-client-react";
import { apiPost } from "@/lib/api";
import { Zap } from "lucide-react";

type EntryMode = "sale" | "purchase";

export default function QuickEntry() {
  const [mode, setMode] = useState<EntryMode>("sale");
  const [productId, setProductId] = useState<string>("");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("0");
  const [customerId, setCustomerId] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [supplierName, setSupplierName] = useState("");
  const [entryDate, setEntryDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("message");
  const [submitting, setSubmitting] = useState(false);

  const { data: products } = useGetProducts({ limit: 100 });
  const { data: customers } = useGetCustomers({ limit: 100 });
  const { data: suppliers } = useGetSuppliers();

  const selectedProduct = useMemo(() => products?.data.find((item) => String(item.id) === productId), [products, productId]);

  useEffect(() => {
    if (!selectedProduct) {
      return;
    }

    const defaultPrice = mode === "sale"
      ? Number(selectedProduct.salePrice ?? 0)
      : Number(selectedProduct.costPrice ?? 0);

    setPrice((currentPrice) => {
      if (currentPrice && Number(currentPrice) !== 0) {
        return currentPrice;
      }
      return String(defaultPrice);
    });
  }, [mode, selectedProduct]);

  const resetForm = () => {
    setProductId("");
    setQuantity("1");
    setPrice("0");
    setCustomerId("");
    setCustomerName("");
    setSupplierId("");
    setSupplierName("");
    setNotes("");
  };

  const handleSubmit = async () => {
    if (!productId) {
      setStatus("Please choose a product first.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "sale") {
        await apiPost("/api/sales", {
          customerId: customerId ? Number(customerId) : undefined,
          customerName: customerName || "Walk-in customer",
          discount: 0,
          saleDate: entryDate || undefined,
          status: status || undefined,
          notes: notes || undefined,
          items: [{ productId: Number(productId), quantity: Number(quantity), unitPrice: Number(price || selectedProduct?.salePrice || 0) }],
        });
      } else {
        await apiPost("/api/purchases", {
          supplierId: supplierId ? Number(supplierId) : undefined,
          supplierName: supplierName || "Walk-in supplier",
          purchaseDate: entryDate || undefined,
          status: "received",
          notes: notes || undefined,
          items: [{ productId: Number(productId), quantity: Number(quantity), unitCost: Number(price || selectedProduct?.costPrice || 0) }],
        });
      }
      setStatus(`${mode === "sale" ? "Sale" : "Purchase"} created successfully.`);
      resetForm();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create entry.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Zap className="w-6 h-6 text-primary" /> Quick Entry</h1>
          <p className="text-muted-foreground text-sm mt-1">Create a sale or purchase in seconds for fast day-to-day operations.</p>
        </div>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Fast transaction capture</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Entry type</Label>
                <Select value={mode} onValueChange={(value) => setMode(value as EntryMode)}>
                  <SelectTrigger className="bg-background/50 border-border"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="sale">Quick Sale</SelectItem>
                    <SelectItem value="purchase">Quick Purchase</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Product</Label>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger className="bg-background/50 border-border"><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {products?.data.map((product) => (
                      <SelectItem key={product.id} value={String(product.id)}>{product.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Quantity</Label>
                <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="bg-background/50 border-border" />
              </div>
              <div className="space-y-1">
                <Label>{mode === "sale" ? "Unit price" : "Unit cost"}</Label>
                <Input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="bg-background/50 border-border" />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Entry date</Label>
                <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="bg-background/50 border-border" />
              </div>
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
            </div>

            {mode === "sale" ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Customer</Label>
                  <Select value={customerId} onValueChange={(value) => setCustomerId(value)}>
                    <SelectTrigger className="bg-background/50 border-border"><SelectValue placeholder="Registered customer" /></SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {customers?.data.map((customer) => (
                        <SelectItem key={customer.id} value={String(customer.id)}>{customer.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Customer name</Label>
                  <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Walk-in or override" className="bg-background/50 border-border" />
                </div>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Supplier</Label>
                  <Select value={supplierId} onValueChange={(value) => setSupplierId(value)}>
                    <SelectTrigger className="bg-background/50 border-border"><SelectValue placeholder="Registered supplier" /></SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {suppliers?.map((supplier) => (
                        <SelectItem key={supplier.id} value={String(supplier.id)}>{supplier.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Supplier name</Label>
                  <Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Override or walk-in" className="bg-background/50 border-border" />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label>Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note" className="bg-background/50 border-border" />
            </div>

            <div className="rounded-lg border border-border bg-background/30 p-3 text-sm text-muted-foreground">
              <p>Suggested {mode === "sale" ? "sale" : "cost"} price: Rs. {Number(price || selectedProduct?.salePrice || selectedProduct?.costPrice || 0).toLocaleString()}</p>
            </div>

            {status ? <p className="text-sm text-primary">{status}</p> : null}

            <Button onClick={handleSubmit} disabled={submitting} className="bg-primary hover:bg-primary/90">
              {submitting ? "Saving..." : `Create ${mode === "sale" ? "sale" : "purchase"}`}
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
