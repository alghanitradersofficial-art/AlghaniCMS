import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { SectionLoading, PageLoading } from "@/components/loading-state";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { useGetSuppliers } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Package, Receipt, ShoppingCart, CalendarIcon, Wallet, Edit, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type SupplierProduct = {
  id: number; productId: number; productName: string | null; productSku: string | null;
  supplierSku: string | null; supplierProductName: string | null; costPrice: number | null; isPreferred: boolean;
};

type LedgerEntry = {
  id: number; type: string; amount: number; runningBalance: number; description: string | null; entryDate: string;
};

type SupplierLedgerResponse = {
  supplierId: number; openingBalance: number; currentBalance: number; outstandingAmount: number;
  totalPurchases: number; totalPayments: number; entries: LedgerEntry[];
};

type PurchaseRow = {
  id: number; poNumber: string; status: string; total: number; amountPaid: number; purchaseDate: string;
};

type Product = { id: number; name: string; sku: string };

export default function SupplierDetail() {
  const params = useParams<{ id: string }>();
  const supplierId = parseInt(params.id);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: suppliers } = useGetSuppliers({});
  const supplier = suppliers?.find((s) => s.id === supplierId);

  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);

  const productsQuery = useQuery({
    queryKey: ["supplier-products", supplierId],
    queryFn: () => apiGet<SupplierProduct[]>(`/api/suppliers/${supplierId}/products`),
  });

  const ledgerQuery = useQuery({
    queryKey: ["supplier-ledger", supplierId],
    queryFn: () => apiGet<SupplierLedgerResponse>(`/api/suppliers/${supplierId}/ledger`),
  });

  const purchasesQuery = useQuery({
    queryKey: ["supplier-purchases", supplierId],
    queryFn: () => apiGet<PurchaseRow[]>(`/api/suppliers/${supplierId}/purchases`),
  });

  const allProductsQuery = useQuery({
    queryKey: ["all-products-for-supplier-link"],
    queryFn: () => apiGet<Product[]>(`/api/products?limit=500`).then((r: any) => r.data ?? r),
  });

  if (!supplier) {
    return (
      <Layout>
        <PageLoading label="Loading supplier" />
      </Layout>
    );
  }

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["supplier-products", supplierId] });
    qc.invalidateQueries({ queryKey: ["supplier-ledger", supplierId] });
    qc.invalidateQueries({ queryKey: ["supplier-purchases", supplierId] });
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/suppliers">
            <Button size="sm" variant="ghost" className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Suppliers</Button>
          </Link>
        </div>

        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{supplier.name}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {supplier.phone} {supplier.city ? `• ${supplier.city}` : ""}
            </p>
          </div>
          {ledgerQuery.data && (
            <Card className="border-border bg-card">
              <CardContent className="py-3 px-5 flex items-center gap-6">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">We Owe</p>
                  <p className={cn("text-lg font-bold", ledgerQuery.data.currentBalance > 0 ? "text-amber-500" : "text-emerald-500")}>
                    Rs {ledgerQuery.data.currentBalance.toLocaleString()}
                  </p>
                </div>
                <Button size="sm" onClick={() => setPaymentDialogOpen(true)} className="gap-1.5"><Wallet className="w-4 h-4" /> Record Payment</Button>
              </CardContent>
            </Card>
          )}
        </div>

        <Tabs defaultValue="products" className="w-full">
          <TabsList>
            <TabsTrigger value="products" className="gap-1.5"><Package className="w-3.5 h-3.5" /> Products</TabsTrigger>
            <TabsTrigger value="ledger" className="gap-1.5"><Receipt className="w-3.5 h-3.5" /> Ledger</TabsTrigger>
            <TabsTrigger value="purchases" className="gap-1.5"><ShoppingCart className="w-3.5 h-3.5" /> Purchase History</TabsTrigger>
          </TabsList>

          {/* Products tab */}
          <TabsContent value="products" className="space-y-4 mt-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setProductDialogOpen(true)} className="gap-1.5"><Plus className="w-4 h-4" /> Link Product</Button>
            </div>
            <Card className="border-border bg-card">
              <CardContent className="p-0">
                {productsQuery.isLoading ? <SectionLoading label="Loading products" /> : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground uppercase text-xs tracking-wider">
                        <th className="px-4 py-3 text-left">Product</th>
                        <th className="px-4 py-3 text-left">Supplier's Name/SKU</th>
                        <th className="px-4 py-3 text-right">Cost Price</th>
                        <th className="px-4 py-3 text-center">Preferred</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productsQuery.data?.length === 0 ? (
                        <tr><td colSpan={4} className="text-center py-10 text-muted-foreground">No products linked yet</td></tr>
                      ) : productsQuery.data?.map((p) => (
                        <tr key={p.id} className="border-b border-border/50 hover:bg-accent/30">
                          <td className="px-4 py-3 font-medium">{p.productName} <span className="text-muted-foreground text-xs">({p.productSku})</span></td>
                          <td className="px-4 py-3 text-muted-foreground">{p.supplierProductName || p.supplierSku || "—"}</td>
                          <td className="px-4 py-3 text-right">{p.costPrice != null ? `Rs ${p.costPrice.toLocaleString()}` : "—"}</td>
                          <td className="px-4 py-3 text-center">{p.isPreferred && <Badge>Preferred</Badge>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Ledger tab */}
          <TabsContent value="ledger" className="space-y-4 mt-4">
            <LedgerTab supplierId={supplierId} data={ledgerQuery.data} isLoading={ledgerQuery.isLoading} onChanged={invalidateAll} />
          </TabsContent>

          {/* Purchase history tab */}
          <TabsContent value="purchases" className="mt-4">
            <Card className="border-border bg-card">
              <CardContent className="p-0">
                {purchasesQuery.isLoading ? <SectionLoading label="Loading purchases" /> : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground uppercase text-xs tracking-wider">
                        <th className="px-4 py-3 text-left">PO Number</th>
                        <th className="px-4 py-3 text-left">Date</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3 text-right">Total</th>
                        <th className="px-4 py-3 text-right">Paid</th>
                        <th className="px-4 py-3 text-right">Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchasesQuery.data?.length === 0 ? (
                        <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">No purchase history</td></tr>
                      ) : purchasesQuery.data?.map((p) => (
                        <tr key={p.id} className="border-b border-border/50 hover:bg-accent/30">
                          <td className="px-4 py-3 font-medium">{p.poNumber}</td>
                          <td className="px-4 py-3 text-muted-foreground">{format(new Date(p.purchaseDate), "d MMM yyyy")}</td>
                          <td className="px-4 py-3"><Badge variant="outline">{p.status}</Badge></td>
                          <td className="px-4 py-3 text-right">Rs {p.total.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right text-emerald-500">Rs {p.amountPaid.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right text-amber-500">Rs {(p.total - p.amountPaid).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Link Product dialog */}
      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <LinkProductForm
          products={allProductsQuery.data ?? []}
          onSubmit={async (payload) => {
            try {
              await apiPost(`/api/suppliers/${supplierId}/products`, payload);
              toast({ title: "Product linked" });
              invalidateAll();
              setProductDialogOpen(false);
            } catch (e: any) {
              toast({ title: "Failed to link product", description: e.message, variant: "destructive" });
            }
          }}
        />
      </Dialog>

      {/* Record Payment dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <PaymentForm
          onSubmit={async (payload) => {
            try {
              await apiPost(`/api/suppliers/${supplierId}/payments`, payload);
              toast({ title: "Payment recorded" });
              invalidateAll();
              setPaymentDialogOpen(false);
            } catch (e: any) {
              toast({ title: "Failed to record payment", description: e.message, variant: "destructive" });
            }
          }}
        />
      </Dialog>
    </Layout>
  );
}

function LedgerTab({ supplierId, data, isLoading, onChanged }: { supplierId: number; data?: SupplierLedgerResponse; isLoading: boolean; onChanged: () => void }) {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<LedgerEntry | null>(null);

  if (isLoading) return <SectionLoading label="Loading ledger" />;
  if (!data) return null;

  const handleDelete = async (entry: LedgerEntry) => {
    if (!window.confirm("Delete this ledger entry?")) return;
    try {
      await apiDelete(`/api/suppliers/${supplierId}/ledger/${entry.id}`);
      toast({ title: "Ledger entry deleted" });
      onChanged();
    } catch (e: any) {
      toast({ title: "Failed to delete entry", description: e.message, variant: "destructive" });
    }
  };

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Opening Balance" value={data.openingBalance} />
        <StatCard label="Total Purchases" value={data.totalPurchases} />
        <StatCard label="Total Payments" value={data.totalPayments} accent="emerald" />
        <StatCard label="Outstanding" value={data.outstandingAmount} accent="amber" />
      </div>

      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} className="gap-1.5"><Plus className="w-4 h-4" /> Add Return/Adjustment</Button>
      </div>

      <Card className="border-border bg-card">
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground uppercase text-xs tracking-wider">
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Description</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">No ledger entries yet</td></tr>
              ) : data.entries.map((e) => {
                const isEditable = e.type === "return" || e.type === "adjustment";
                return (
                  <tr key={e.id} className="border-b border-border/50 hover:bg-accent/30">
                    <td className="px-4 py-3 text-muted-foreground">{format(new Date(e.entryDate), "d MMM yyyy")}</td>
                    <td className="px-4 py-3"><Badge variant="outline" className="capitalize">{e.type.replace("_", " ")}</Badge></td>
                    <td className="px-4 py-3 text-muted-foreground">{e.description || "—"}</td>
                    <td className={cn("px-4 py-3 text-right font-medium", e.amount < 0 ? "text-emerald-500" : "text-foreground")}>
                      {e.amount < 0 ? "-" : "+"}Rs {Math.abs(e.amount).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">Rs {e.runningBalance.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      {isEditable ? (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setEditEntry(e)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(e)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <AdjustmentForm
          onSubmit={async (payload) => {
            try {
              await apiPost(`/api/suppliers/${supplierId}/ledger`, payload);
              toast({ title: "Ledger entry added" });
              onChanged();
              setAddOpen(false);
            } catch (e: any) {
              toast({ title: "Failed to add entry", description: e.message, variant: "destructive" });
            }
          }}
        />
      </Dialog>

      <Dialog open={!!editEntry} onOpenChange={(open) => { if (!open) setEditEntry(null); }}>
        {editEntry ? (
          <AdjustmentForm
            initial={{
              type: editEntry.type as "return" | "adjustment",
              amount: Math.abs(editEntry.amount).toString(),
              description: editEntry.description ?? "",
              entryDate: new Date(editEntry.entryDate),
            }}
            submitLabel="Save changes"
            onSubmit={async (payload) => {
              try {
                await apiPatch(`/api/suppliers/${supplierId}/ledger/${editEntry.id}`, payload);
                toast({ title: "Ledger entry updated" });
                onChanged();
                setEditEntry(null);
              } catch (e: any) {
                toast({ title: "Failed to update entry", description: e.message, variant: "destructive" });
              }
            }}
          />
        ) : null}
      </Dialog>
    </>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: "emerald" | "amber" }) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={cn("text-xl font-bold mt-1", accent === "emerald" && "text-emerald-500", accent === "amber" && "text-amber-500")}>
          Rs {value.toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}

function DatePickerField({ date, onChange }: { date: Date; onChange: (d: Date) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start gap-2 font-normal">
          <CalendarIcon className="w-4 h-4" /> {format(date, "d MMM yyyy")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => { if (d) { onChange(d); setOpen(false); } }}
          captionLayout="dropdown"
          startMonth={new Date(2015, 0)}
          endMonth={new Date()}
        />
      </PopoverContent>
    </Popover>
  );
}

function AdjustmentForm({
  initial,
  onSubmit,
  submitLabel = "Add Entry",
}: {
  initial?: { type: "return" | "adjustment"; amount: string; description: string; entryDate: Date };
  onSubmit: (payload: any) => void;
  submitLabel?: string;
}) {
  const [type, setType] = useState<"return" | "adjustment">(initial?.type ?? "return");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [date, setDate] = useState<Date>(initial?.entryDate ?? new Date());

  return (
    <DialogContent className="bg-card border-border max-w-md">
      <DialogHeader><DialogTitle>{initial ? "Edit Return / Adjustment" : "Add Return / Adjustment"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 py-2">
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as any)}>
            <SelectTrigger className="bg-background/50 border-border"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="return">Return</SelectItem>
              <SelectItem value="adjustment">Adjustment</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Amount *</Label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="bg-background/50 border-border" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Date</Label>
          <DatePickerField date={date} onChange={setDate} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Description</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} className="bg-background/50 border-border" />
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={!amount}
          onClick={() => onSubmit({ type, amount: parseFloat(amount), description: description || undefined, entryDate: date.toISOString() })}
        >
          {submitLabel}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function PaymentForm({ onSubmit }: { onSubmit: (payload: any) => void }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState<Date>(new Date());

  return (
    <DialogContent className="bg-card border-border max-w-md">
      <DialogHeader><DialogTitle>Record Supplier Payment</DialogTitle></DialogHeader>
      <div className="grid gap-3 py-2">
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Amount *</Label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="bg-background/50 border-border" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Method</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="bg-background/50 border-border"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
              <SelectItem value="cheque">Cheque</SelectItem>
              <SelectItem value="jazzcash">JazzCash</SelectItem>
              <SelectItem value="easypaisa">EasyPaisa</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Payment Date</Label>
          <DatePickerField date={date} onChange={setDate} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Reference (optional)</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} className="bg-background/50 border-border" />
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={!amount}
          onClick={() => onSubmit({ amount: parseFloat(amount), method, reference: reference || undefined, paymentDate: date.toISOString() })}
        >
          Record Payment
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function LinkProductForm({ products, onSubmit }: { products: Product[]; onSubmit: (payload: any) => void }) {
  const [productId, setProductId] = useState<string>("");
  const [supplierSku, setSupplierSku] = useState("");
  const [supplierProductName, setSupplierProductName] = useState("");
  const [costPrice, setCostPrice] = useState("");

  return (
    <DialogContent className="bg-card border-border max-w-md">
      <DialogHeader><DialogTitle>Link Product to Supplier</DialogTitle></DialogHeader>
      <div className="grid gap-3 py-2">
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Product *</Label>
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger className="bg-background/50 border-border"><SelectValue placeholder="Select a product" /></SelectTrigger>
            <SelectContent>
              {products.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.sku})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Supplier's Name for this Product</Label>
          <Input value={supplierProductName} onChange={(e) => setSupplierProductName(e.target.value)} placeholder="e.g. how the supplier calls it" className="bg-background/50 border-border" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Supplier's SKU/Code</Label>
          <Input value={supplierSku} onChange={(e) => setSupplierSku(e.target.value)} className="bg-background/50 border-border" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Cost Price</Label>
          <Input type="number" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} className="bg-background/50 border-border" />
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={!productId}
          onClick={() => onSubmit({
            productId: parseInt(productId),
            supplierProductName: supplierProductName || undefined,
            supplierSku: supplierSku || undefined,
            costPrice: costPrice ? parseFloat(costPrice) : undefined,
          })}
        >
          Link Product
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
