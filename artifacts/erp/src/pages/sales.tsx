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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useGetSales, useCreateSale, useUpdateSale, useDeleteSale, useGetProducts, useGetCustomers, getGetSalesQueryKey, getGetCustomersQueryKey } from "@workspace/api-client-react";
import { apiGet } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2, ShoppingCart, X, Info, RotateCcw, Clock, CalendarDays, CalendarRange, SlidersHorizontal, ListChecks } from "lucide-react";
import Confirm from "@/components/ui/confirm";
import { PriceHistoryPanel } from "@/components/price-history-panel";
import { ReturnsClaimsPanel } from "@/components/returns-claims-panel";
import { AiExcelImportButton } from "@/components/ai-excel-import-button";
import { useToast } from "@/hooks/use-toast";

type LineItem = { productId: number; productName: string; quantity: number; unitPrice: number; };
type Period = "all" | "daily" | "weekly" | "monthly" | "custom";

function toDateStr(d: Date) { return d.toISOString().slice(0, 10); }

// Resolves each period tab to a concrete [from, to] invoice-date range.
// All = no date filter (every order ever placed). Daily = today. Weekly =
// rolling last 7 days. Monthly = 1st of this month through today.
// Custom = whatever the user picked (falls back to today).
function periodRange(period: Period, customFrom: string, customTo: string): { from: string; to: string; label: string } {
  const now = new Date();
  const todayStr = toDateStr(now);
  if (period === "all") {
    return { from: "", to: "", label: "All orders" };
  }
  if (period === "weekly") {
    const start = new Date(now); start.setDate(start.getDate() - 6);
    return { from: toDateStr(start), to: todayStr, label: "Last 7 days" };
  }
  if (period === "monthly") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: toDateStr(start), to: todayStr, label: now.toLocaleDateString(undefined, { month: "long", year: "numeric" }) };
  }
  if (period === "custom") {
    return { from: customFrom || todayStr, to: customTo || todayStr, label: "Custom range" };
  }
  return { from: todayStr, to: todayStr, label: "Today" };
}

export default function Sales() {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [topTab, setTopTab] = useState<"sales" | "returns">("sales");
  const [periodTab, setPeriodTab] = useState<Period>("all");
  const [customFrom, setCustomFrom] = useState(new Date().toISOString().slice(0, 10));
  const [customTo, setCustomTo] = useState(new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState<number | undefined>(undefined);
  const [invoiceNumber, setInvoiceNumber] = useState("");
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
  const [editSaleItems, setEditSaleItems] = useState<LineItem[]>([]);
  const [editSaleInvoiceNumber, setEditSaleInvoiceNumber] = useState("");
  const [editSaleDiscount, setEditSaleDiscount] = useState("0");
  const [editSaleDate, setEditSaleDate] = useState("");
  const [editExpandedRow, setEditExpandedRow] = useState<number | null>(null);

  const range = periodRange(periodTab, customFrom, customTo);
  const salesQueryParams = {
    search: search || undefined,
    status: statusFilter as "pending" | "completed" | "cancelled" | undefined,
    dateFrom: range.from || undefined,
    dateTo: range.to || undefined,
    page,
    limit: 20,
  } as any;

  const { data, isLoading, refetch: refetchSales } = useGetSales(salesQueryParams);
  const { data: summary } = useQuery({
    queryKey: ["sales-summary", salesQueryParams.search, salesQueryParams.status, range.from, range.to],
    queryFn: () => apiGet<{ count: number; totalAmount: number; totalReceived: number }>(
      `/api/sales/summary?${new URLSearchParams({
        ...(search ? { search } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(range.from ? { dateFrom: range.from } : {}),
        ...(range.to ? { dateTo: range.to } : {}),
      }).toString()}`
    ),
  });
  // Returns & Claims needs the full invoice list to pick from (not just
  // whatever the Daily/Weekly/Monthly/Custom filters currently show), so it
  // gets its own unfiltered query.
  const { data: allSalesForPicker } = useGetSales({ limit: 200 });
  const { data: products } = useGetProducts({ limit: 100 });
  const { data: customers } = useGetCustomers({ limit: 100 });
  const createSale = useCreateSale();
  const updateSale = useUpdateSale();
  const deleteSale = useDeleteSale();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetSalesQueryKey(), exact: false });
    qc.invalidateQueries({ queryKey: ["sales-summary"], exact: false });
    // Customer totalSpent/totalOrders are computed from sales, so the
    // customers list must also refresh whenever a sale is created/edited/deleted.
    qc.invalidateQueries({ queryKey: getGetCustomersQueryKey(), exact: false });
    // invalidateQueries should already refetch the active query, but some
    // status-dropdown updates were only showing up after a full page
    // reload — force it explicitly so the list always reflects the latest
    // state right away.
    refetchSales();
  };

  const openNew = () => {
    setCustomerName(""); setCustomerId(undefined); setInvoiceNumber(""); setDiscount("0"); setNotes(""); setSaleDate(new Date().toISOString().slice(0, 10)); setAmountReceived("0"); setPaymentMethod("cash"); setItems([]); setEditingSale(null); setExpandedRow(null); setOpen(true);
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
    try {
      await createSale.mutateAsync({
        data: {
          customerId,
          customerName,
          invoiceNumber: invoiceNumber || undefined,
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
        } as any
      });
      invalidate();
      setOpen(false);
      toast({ title: "Sale created", description: "The new sale order has been added." });
    } catch (e: any) {
      toast({ title: "Could not create sale", description: e?.message || "Something went wrong.", variant: "destructive" });
    }
  };

  const handleStatusUpdate = async (id: number, status: "pending" | "completed" | "cancelled") => {
    try {
      await updateSale.mutateAsync({ id, data: { status } });
      invalidate();
    } catch (e: any) {
      toast({ title: "Could not change status", description: e?.message || "Something went wrong.", variant: "destructive" });
    }
  };

  const openEditSale = (sale: NonNullable<typeof data>['data'][0]) => {
    setEditingSale(sale);
    setEditSaleStatus(sale.status);
    setEditSaleNotes(sale.notes || "");
    setEditSaleInvoiceNumber(sale.invoiceNumber || "");
    setEditSaleItems((sale.items as any[]).map(i => ({ productId: i.productId, productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice })) || []);
    setEditSaleDiscount(String(sale.discount || "0"));
    setEditSaleDate(((sale as any).saleDate || sale.createdAt).toISOString().slice(0, 10));
    setEditExpandedRow(null);
    setEditSaleOpen(true);
  };

  const updateEditItem = (idx: number, field: keyof LineItem, val: string | number) => {
    setEditSaleItems(prev => {
      const next = [...prev];
      if (field === "productId") {
        const product = products?.data.find(p => p.id === Number(val));
        if (product) {
          next[idx] = { ...next[idx], productId: product.id, productName: product.name, unitPrice: 0 };
          (async () => {
            try {
              if (editingSale?.customerId) {
                const suggestion = await apiGet<any>(`/api/customers/${editingSale.customerId}/price-suggestion/${product.id}`);
                const suggested = suggestion.previousCustomerPrice ?? suggestion.suggestedSellingPrice ?? 0;
                setEditSaleItems(cur => {
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

  const handleSaveFullEdit = async () => {
    if (!editingSale) return;
    try {
      await updateSale.mutateAsync({ 
        id: editingSale.id, 
        data: { 
          status: editSaleStatus, 
          notes: editSaleNotes || undefined,
          invoiceNumber: editSaleInvoiceNumber || undefined,
          discount: parseFloat(editSaleDiscount || "0"),
          items: editSaleItems.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice })),
          saleDate: new Date(editSaleDate).toISOString(),
        } as any
      });
      invalidate();
      setEditSaleOpen(false);
      setEditingSale(null);
      toast({ title: "Sale updated", description: "Changes have been saved." });
    } catch (e: any) {
      toast({ title: "Could not save changes", description: e?.message || "Something went wrong.", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteSale.mutateAsync({ id });
      invalidate();
    } catch (e: any) {
      toast({ title: "Could not delete sale", description: e?.message || "Something went wrong.", variant: "destructive" });
    }
  };

  const statusColor = (s: string) => s === "completed" ? "bg-green-500/10 text-green-400 border-0" : s === "pending" ? "bg-yellow-500/10 text-yellow-400 border-0" : "bg-red-500/10 text-red-400 border-0";

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl"><ShoppingCart className="h-5 w-5 text-primary sm:h-6 sm:w-6" /> Sales</h1>
            <p className="mt-1 text-sm text-muted-foreground">{topTab === "sales" ? `${range.label} · ${summary?.count ?? 0} order${(summary?.count ?? 0) === 1 ? "" : "s"}` : "Sale returns and damaged-item claims"}</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <AiExcelImportButton importType="sales" onComplete={invalidate} />
            <Button onClick={openNew} className="w-full gap-2 bg-primary hover:bg-primary/90 sm:w-auto"><Plus className="h-4 w-4" /> New Sale</Button>
          </div>
        </div>

        <Tabs value={topTab} onValueChange={(v) => setTopTab(v as "sales" | "returns")}>
          <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
            <TabsTrigger value="sales" className="gap-1.5"><ShoppingCart className="h-3.5 w-3.5" /> Sales Orders</TabsTrigger>
            <TabsTrigger value="returns" className="gap-1.5"><RotateCcw className="h-3.5 w-3.5" /> Returns &amp; Claims</TabsTrigger>
          </TabsList>

          <TabsContent value="sales" className="mt-4 space-y-4">
            {/* Daily / Weekly / Monthly / Custom */}
            <div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-card p-1.5">
              {([
                { key: "all" as const, label: "All", icon: ListChecks },
                { key: "daily" as const, label: "Daily", icon: Clock },
                { key: "weekly" as const, label: "Weekly", icon: CalendarDays },
                { key: "monthly" as const, label: "Monthly", icon: CalendarRange },
                { key: "custom" as const, label: "Custom", icon: SlidersHorizontal },
              ]).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setPeriodTab(key); setPage(1); }}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors sm:flex-none sm:px-4 ${
                    periodTab === key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>

            {periodTab === "custom" && (
              <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">From</Label>
                  <Input type="date" value={customFrom} onChange={e => { setCustomFrom(e.target.value); setPage(1); }} className="bg-background/50 border-border" />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">To</Label>
                  <Input type="date" value={customTo} onChange={e => { setCustomTo(e.target.value); setPage(1); }} className="bg-background/50 border-border" />
                </div>
              </div>
            )}

            {/* Stat strip for the selected period */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div className="rounded-xl border border-border bg-card p-2.5 sm:p-3">
                <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground sm:text-[11px]">Orders</p>
                <p className="mt-1 text-base font-bold sm:text-xl">{summary?.count ?? 0}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-2.5 sm:p-3">
                <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground sm:text-[11px]">Total Sales</p>
                <p className="mt-1 truncate text-base font-bold text-secondary sm:text-xl">Rs. {Number(summary?.totalAmount ?? 0).toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-2.5 sm:p-3">
                <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground sm:text-[11px]">Received</p>
                <p className="mt-1 truncate text-base font-bold text-emerald-500 sm:text-xl">Rs. {Number(summary?.totalReceived ?? 0).toLocaleString()}</p>
              </div>
            </div>

            {/* Universal search — invoice #, customer, or product — plus status filter */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search invoice #, customer, or product..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="border-border bg-card pl-9" />
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
                <div className="space-y-3 p-3">
                  {isLoading ? (
                    <div className="rounded-2xl border border-border/60 bg-background/70 p-6 text-center text-sm text-muted-foreground">Loading sales...</div>
                  ) : (data?.data || []).length === 0 ? (
                    <div className="rounded-2xl border border-border/60 bg-background/70 p-6 text-center text-sm text-muted-foreground">No sales in {range.label.toLowerCase()}.</div>
                  ) : (data?.data || []).map((sale) => (
                    <div
                      key={sale.id}
                      onClick={() => setLocation(`/sales/${sale.id}`)}
                      className="cursor-pointer rounded-2xl border border-border/60 bg-background/70 p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-background"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">{sale.invoiceNumber}</div>
                            <Badge className={statusColor(sale.status)}>{sale.status}</Badge>
                          </div>
                          <div className="mt-2 truncate text-sm font-semibold">{sale.customerName}</div>
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <span>{new Date(((sale as any).saleDate ?? sale.createdAt)).toLocaleDateString()}</span>
                            <span className="font-semibold text-secondary">Rs. {Number(sale.total).toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 lg:justify-end" onClick={(e) => e.stopPropagation()}>
                          <Select value={sale.status} onValueChange={(v) => handleStatusUpdate(sale.id, v as "pending" | "completed" | "cancelled") }>
                            <SelectTrigger className="h-8 w-28 border-border bg-background/50 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border">
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button size="sm" variant="ghost" onClick={() => openEditSale(sale)} className="h-8 w-8 p-0 hover:bg-accent"><Edit className="h-4 w-4" /></Button>
                          <Confirm title="Delete this sale?" description="This will remove the sale record." onConfirm={() => handleDelete(sale.id)} trigger={<Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:bg-destructive/20 hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>} />
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
          </TabsContent>

          <TabsContent value="returns" className="mt-4">
            <ReturnsClaimsPanel
              sales={(allSalesForPicker?.data || []).map(s => ({
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
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader><DialogTitle>New Sale Order</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Invoice Number *</Label>
              <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} className="bg-background/50 border-border" placeholder="INV-001" />
            </div>

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
            <Button onClick={handleSave} disabled={!customerName || !invoiceNumber.trim() || items.length === 0 || createSale.isPending} className="bg-primary hover:bg-primary/90">Create Sale</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

        <Dialog open={editSaleOpen} onOpenChange={(open) => { setEditSaleOpen(open); if (!open) setEditingSale(null); }}>
          <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border">
            <DialogHeader><DialogTitle>Edit Invoice - {editingSale?.invoiceNumber}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              {/* Customer info - read-only in edit mode */}
              <div className="rounded-2xl border border-border/60 bg-background/60 p-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Customer</p>
                <p className="font-semibold">{editingSale?.customerName}</p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Invoice Number *</Label>
                <Input value={editSaleInvoiceNumber} onChange={e => setEditSaleInvoiceNumber(e.target.value)} className="bg-background/50 border-border" placeholder="INV-001" />
              </div>

              {/* Line Items */}
              <div className="space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Line Items</Label>
                  <Button size="sm" variant="outline" onClick={() => {
                    if (products?.data[0]) {
                      const p = products.data[0];
                      setEditSaleItems(prev => [...prev, { productId: p.id, productName: p.name, quantity: 1, unitPrice: 0 }]);
                    }
                  }} className="h-7 gap-1 border-border text-xs"><Plus className="h-3 w-3" /> Add Item</Button>
                </div>
                {editSaleItems.map((item, idx) => (
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
                        <Button size="sm" variant="ghost" onClick={() => { setEditSaleItems(prev => prev.filter((_, i) => i !== idx)); if (editExpandedRow === idx) setEditExpandedRow(null); }} className="h-8 w-8 p-0 hover:bg-destructive/20 hover:text-destructive"><X className="h-4 w-4" /></Button>
                      </div>
                    </div>
                    {editExpandedRow === idx && (
                      <PriceHistoryPanel customerId={editingSale?.customerId == null ? undefined : Number(editingSale.customerId)} productId={item.productId} proposedPrice={item.unitPrice} />
                    )}
                  </div>
                ))}
              </div>

              {/* Discount, Date, Status */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Discount (Rs.)</Label>
                  <Input type="number" value={editSaleDiscount} onChange={e => setEditSaleDiscount(e.target.value)} className="bg-background/50 border-border" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Invoice Date</Label>
                  <Input type="date" value={editSaleDate} onChange={e => setEditSaleDate(e.target.value)} className="bg-background/50 border-border" />
                </div>
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
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
                <Input value={editSaleNotes} onChange={e => setEditSaleNotes(e.target.value)} className="bg-background/50 border-border" />
              </div>

              {/* Totals */}
              <div className="border-t border-border pt-3 text-right space-y-1">
                <p className="text-sm text-muted-foreground">Subtotal: Rs. {editSaleItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0).toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Discount: Rs. {parseFloat(editSaleDiscount || "0").toLocaleString()}</p>
                <p className="text-lg font-bold text-secondary">Total: Rs. {(editSaleItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0) - parseFloat(editSaleDiscount || "0")).toLocaleString()}</p>
              </div>
            </div>
            <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => { setEditSaleOpen(false); setEditingSale(null); }} className="border-border">Cancel</Button>
              <Button onClick={handleSaveFullEdit} disabled={updateSale.isPending || !editSaleInvoiceNumber.trim() || editSaleItems.length === 0} className="bg-primary hover:bg-primary/90">Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </Layout>
  );
}
