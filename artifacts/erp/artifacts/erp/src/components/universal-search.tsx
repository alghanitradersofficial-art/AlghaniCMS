import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useGetCustomers, useGetProducts, useGetSale } from "@workspace/api-client-react";
import { Search } from "lucide-react";
import { DateRangeSelector, type DateRangeValue } from "@/components/date-range-selector";
import { useCustomerStatement, usePriceHistory, useLedgerTimeline } from "@/hooks/use-ledger";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function UniversalSearch({ range, autoFocus, placeholder }: { range: DateRangeValue; autoFocus?: boolean; placeholder?: string }) {
  const [q, setQ] = useState("");
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [debounced, setDebounced] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [openSaleId, setOpenSaleId] = useState<number | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data: customersRes } = useGetCustomers({ search: debounced || undefined, limit: 6 });
  const { data: productsRes } = useGetProducts({ search: debounced || undefined, limit: 6 });

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      // small timeout to wait for animation/visibility
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [autoFocus]);

  return (
    <Card className="bg-card">
      <CardContent className="p-2">
        <div className="flex gap-2 items-center">
          <div className="relative w-36 sm:w-60 focus-within:w-full transition-all duration-200">
            <Input ref={inputRef} className="text-sm pl-3 pr-3 bg-transparent border-none focus:ring-0" placeholder={placeholder || "Search anything"} value={q} onChange={e => setQ(e.target.value)} onFocus={() => { /* expands via focus-within */ }} />
          </div>
        </div>

        <div className="mt-3 grid gap-2">
          {debounced ? (
            <>
              {customersRes && customersRes.data && customersRes.data.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-2 font-medium">Customers</div>
                  <div className="space-y-2">
                    {customersRes.data.map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between gap-2 rounded p-2 hover:bg-background/50">
                        <div>
                          <div className="font-medium">{c.name}</div>
                          <div className="text-xs text-muted-foreground">{c.phone || "—"}</div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => { setSelectedCustomer(c.id); setOpen(true); }}>View Statement</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {productsRes && productsRes.data && productsRes.data.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-2 font-medium">Products</div>
                  <div className="space-y-2">
                    {productsRes.data.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between gap-2 rounded p-2 hover:bg-background/50">
                        <div>
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground">SKU: {p.sku || "—"}</div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => { /* future: open product detail */ }}>Open</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        <Dialog open={open} onOpenChange={(v) => { if (!v) setSelectedCustomer(null); setOpen(v); }}>
          <DialogContent className="bg-card border-border w-full max-w-[calc(100vw-1rem)] sm:max-w-4xl lg:max-w-5xl max-h-[92vh] overflow-hidden p-4 sm:p-6">
            <DialogHeader className="pb-3">
              <DialogTitle>Customer Statement</DialogTitle>
            </DialogHeader>
            {selectedCustomer && (
              <>
                <div className="overflow-auto max-h-[80vh] pr-0 lg:pr-4">
                  <div className="grid gap-6 lg:grid-cols-[1.35fr_0.95fr] min-h-[68vh]">
                    <div className="space-y-4 overflow-hidden rounded-2xl border border-border/70 bg-background/80 p-4">
                      <div className="text-sm font-semibold">Product Price History</div>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <input className="w-full flex-1 rounded-md border border-border px-3 py-2 text-sm" placeholder="Search product..." value={productQuery} onChange={e => setProductQuery(e.target.value)} />
                        <Button onClick={() => setSelectedProductId(null)} variant="ghost" size="sm">Clear</Button>
                      </div>
                      <div className="overflow-auto max-h-[44vh] pr-0 md:pr-2">
                        <ProductSearchResults query={productQuery} onSelect={(id) => setSelectedProductId(id)} />
                        {selectedProductId && (
                          <ProductPriceHistory customerId={selectedCustomer} productId={selectedProductId} range={range} />
                        )}
                      </div>
                    </div>
                    <div className="space-y-4 overflow-hidden rounded-2xl border border-border/70 bg-background/80 p-4">
                      <div className="text-sm font-semibold">Timeline</div>
                      <div className="overflow-auto max-h-[68vh]">
                        <CustomerTimelinePanel customerId={selectedCustomer} range={range} onOpenSale={(id) => setOpenSaleId(id)} />
                      </div>
                    </div>
                  </div>
                </div>
                {/* Sale details drawer/modal */}
                <Dialog open={!!openSaleId} onOpenChange={(v) => { if (!v) setOpenSaleId(null); }}>
                  <DialogContent className="bg-card border-border w-full max-w-full sm:max-w-xl max-h-[85vh] overflow-auto p-4 sm:p-6">
                    <DialogHeader>
                      <DialogTitle>Sale Items</DialogTitle>
                    </DialogHeader>
                    {openSaleId && <SaleItemsPanel saleId={openSaleId} />}
                  </DialogContent>
                </Dialog>
              </>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function CustomerStatementPanel({ customerId, range }: { customerId: number; range: DateRangeValue }) {
  return <div />;
}

function CustomerTimelinePanel({ customerId, range, onOpenSale }: { customerId: number; range: DateRangeValue; onOpenSale: (id: number | null) => void }) {
  const { data, isLoading } = useLedgerTimeline(customerId);
  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold">Timeline</div>
      <div className="border-t border-border pt-2">
        {isLoading ? <div className="text-sm text-muted-foreground p-4">Loading…</div> : (
          <>
            {/* Desktop / Tablet: table view */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="min-w-[700px] w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left py-2">Date</th>
                    <th className="text-left py-2">Type</th>
                    <th className="text-left py-2">Description</th>
                    <th className="text-right py-2">Amount</th>
                    <th className="text-right py-2">Items</th>
                    <th className="text-right py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.data ?? []).map((l: any) => (
                    <tr key={l.id} className="border-b border-border/40">
                      <td className="py-2">{new Date(l.date).toLocaleDateString()}</td>
                      <td className="py-2 capitalize">{l.type}</td>
                      <td className="py-2 text-muted-foreground">{l.description}</td>
                      <td className="py-2 text-right">Rs. {Number(l.amount).toLocaleString()}</td>
                      <td className="py-2 text-right">
                        {l.saleId != null ? <SaleItemCount saleId={l.saleId} /> : "—"}
                      </td>
                      <td className="py-2 text-right">
                        {l.saleId != null ? <Button size="sm" variant="outline" onClick={() => onOpenSale(l.saleId)}>Show Items</Button> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: stacked cards for each timeline row */}
            <div className="space-y-2 sm:hidden">
              {(data?.data ?? []).map((l: any) => (
                <div key={l.id} className="p-3 rounded border border-border/30">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 pr-3">
                      <div className="font-medium">{new Date(l.date).toLocaleDateString()} • <span className="capitalize">{l.type}</span></div>
                      <div className="text-xs text-muted-foreground mt-1">{l.description}</div>
                      <div className="text-xs text-muted-foreground mt-2">Items: {l.saleId ? <SaleItemCount saleId={l.saleId} /> : '—'}</div>
                    </div>
                    <div className="ml-2 flex flex-col items-end">
                      <div className="text-sm font-semibold">Rs. {Number(l.amount).toLocaleString()}</div>
                      {l.saleId != null ? <Button size="sm" variant="outline" className="w-full sm:w-auto mt-2" onClick={() => onOpenSale(l.saleId)}>Show Items</Button> : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ProductSearchResults({ query, onSelect }: { query: string; onSelect: (id: number) => void }) {
  const { data } = useGetProducts({ search: query || undefined, limit: 6 });
  if (!query) return <div className="text-xs text-muted-foreground mt-2">Search products to see price history.</div>;
  return (
    <div className="mt-2 space-y-2">
      {data?.data?.map((p: any) => (
        <div key={p.id} className="flex items-center justify-between p-2 rounded hover:bg-background/50">
          <div>
            <div className="font-medium">{p.name}</div>
            <div className="text-xs text-muted-foreground">SKU: {p.sku}</div>
          </div>
          <Button size="sm" variant="outline" onClick={() => onSelect(p.id)}>Select</Button>
        </div>
      ))}
    </div>
  );
}

function ProductPriceHistory({ customerId, productId, range }: { customerId: number; productId: number; range: DateRangeValue }) {
  const from = range.preset === "custom" && range.from ? range.from.toISOString() : undefined;
  const to = range.preset === "custom" && range.to ? range.to.toISOString() : undefined;
  const { data, isLoading } = usePriceHistory(customerId, productId, from, to) as any;
  return (
    <div className="mt-3">
      <div className="text-xs text-muted-foreground mb-2">Price history for selected product</div>
      {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
        <div className="space-y-2">
          {data?.previousSales?.map((s: any, i: number) => (
            <div key={i} className="flex items-center justify-between p-2 rounded border border-border/30">
              <div>
                <div className="font-medium">{s.invoiceNumber} — {new Date(s.invoiceDate).toLocaleDateString()}</div>
                <div className="text-xs text-muted-foreground">Qty: {s.quantity} • Unit: Rs. {s.unitPrice}</div>
              </div>
              <div className="text-sm font-semibold">Rs. {Number(s.finalPrice).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SaleItemsPanel({ saleId }: { saleId: number }) {
  const { data, isLoading } = useGetSale(saleId);
  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading sale…</div>;
  if (!data) return <div className="p-4 text-sm text-muted-foreground">Sale not found.</div>;

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold">{data.invoiceNumber} — {new Date(data.createdAt).toLocaleDateString()}</div>
      <div className="overflow-x-auto">
        <table className="min-w-[600px] w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="text-left py-2">Product</th>
              <th className="text-right py-2">Qty</th>
              <th className="text-right py-2">Unit Price</th>
              <th className="text-right py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((it: any, i: number) => (
              <tr key={i} className="border-b border-border/40">
                <td className="py-2">{it.productName}</td>
                <td className="py-2 text-right">{it.quantity}</td>
                <td className="py-2 text-right">Rs. {Number(it.unitPrice).toLocaleString()}</td>
                <td className="py-2 text-right">Rs. {Number(it.total).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SaleItemCount({ saleId }: { saleId: number }) {
  const { data, isLoading } = useGetSale(saleId);
  if (isLoading) return <span className="text-xs text-muted-foreground">…</span>;
  if (!data) return <span className="text-xs text-muted-foreground">—</span>;
  return <span className="text-xs font-medium">{data.items?.length ?? 0}</span>;
}
