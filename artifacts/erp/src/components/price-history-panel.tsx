import { usePriceHistory, usePriceSuggestion, type PriceSuggestion } from "@/hooks/use-ledger";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingUp, TrendingDown, History } from "lucide-react";
import { useState } from "react";

function InputDate({ label, value, onChange }: { label: string; value?: string; onChange: (v?: string) => void }) {
  return (
    <div className="text-xs">
      <div className="text-muted-foreground text-[10px]">{label}</div>
      <input type="date" value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)} className="bg-background/50 border-border text-xs h-8 px-2 rounded" />
    </div>
  );
}

interface PriceHistoryPanelProps {
  customerId: number | undefined;
  productId: number | undefined;
  proposedPrice: number;
}

export function PriceHistoryPanel({ customerId, productId, proposedPrice }: PriceHistoryPanelProps) {
  const [from, setFrom] = useState<string | undefined>(undefined);
  const [to, setTo] = useState<string | undefined>(undefined);
  const { data: history, isLoading: historyLoading } = usePriceHistory(customerId, productId, from, to);
  const { data: suggestion } = usePriceSuggestion(customerId, productId, proposedPrice || undefined);

  if (!customerId || !productId) {
    return (
      <div className="text-xs text-muted-foreground italic px-1">
        Select a registered customer to see their price history for this product.
      </div>
    );
  }

  if (historyLoading) {
    return <div className="text-xs text-muted-foreground px-1">Loading price history…</div>;
  }

  return (
    <div className="rounded-lg border border-border bg-background/40 p-3 space-y-2 text-xs">
      <div className="flex gap-2 items-center">
        <InputDate label="From" value={from} onChange={setFrom} />
        <InputDate label="To" value={to} onChange={setTo} />
      </div>
      {history?.hasHistory ? (
        <>
          <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
            <History className="w-3.5 h-3.5" /> Price History with this Customer
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div>Last price: <span className="font-semibold text-foreground">Rs. {history.lastSellingPrice?.toLocaleString()}</span></div>
            <div>Last qty: <span className="font-semibold text-foreground">{history.lastQuantity}</span></div>
            <div>Last invoice: <span className="font-mono text-primary">{history.lastInvoiceNumber}</span></div>
            <div>{history.daysSinceLastPurchase} days ago</div>
            <div>Lowest ever: Rs. {history.lowestPriceEver?.toLocaleString()}</div>
            <div>Highest ever: Rs. {history.highestPriceEver?.toLocaleString()}</div>
            <div>Avg price: Rs. {history.averageSellingPrice?.toLocaleString()}</div>
            <div>Total orders: {history.totalOrders}</div>
            <div>Total qty bought: {history.totalQuantityPurchased}</div>
            <div>Total profit earned: Rs. {history.totalProfitEarned?.toLocaleString()}</div>
          </div>
        </>
      ) : (
        <div className="text-muted-foreground">No previous purchases of this product by this customer.</div>
      )}

      {suggestion && (
        <div className="border-t border-border pt-2 space-y-1.5">
          <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
            {suggestion.currentProfit >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-green-400" /> : <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
            Smart Price Suggestion
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div>Cost price: Rs. {suggestion.costPrice.toLocaleString()}</div>
            <div>Suggested price: Rs. {suggestion.suggestedSellingPrice.toLocaleString()}</div>
            <div>Current profit: <span className={suggestion.currentProfit >= 0 ? "text-green-400" : "text-red-400"}>Rs. {suggestion.currentProfit.toLocaleString()} ({suggestion.profitPercentage}%)</span></div>
            {suggestion.previousCustomerPrice != null && (
              <div>Vs. previous: {suggestion.differenceFromPreviousPrice! >= 0 ? "+" : ""}Rs. {suggestion.differenceFromPreviousPrice?.toLocaleString()}</div>
            )}
          </div>
          {suggestion.warnings.map((w: PriceSuggestion["warnings"][number], i: number) => (
            <div key={i} className={`flex items-start gap-1.5 rounded px-2 py-1 ${w.level === "error" ? "bg-red-500/10 text-red-400" : "bg-yellow-500/10 text-yellow-400"}`}>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{w.message}</span>
            </div>
          ))}
          {suggestion.requiresApproval && (
            <Badge className="bg-yellow-500/10 text-yellow-400 border-0">Requires manager approval</Badge>
          )}
        </div>
      )}

      {history?.previousSales && history.previousSales.length > 0 && (
        <div className="border-t border-border pt-2 space-y-2">
          <div className="font-medium text-muted-foreground text-xs">Recent Sales</div>
          <div className="space-y-1 max-h-40 overflow-y-auto text-xs">
            {history.previousSales.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{s.invoiceNumber}</div>
                  <div className="text-muted-foreground text-[11px]">{new Date(s.invoiceDate).toLocaleDateString()}</div>
                </div>
                <div className="text-right">
                  <div>Rs. {s.unitPrice.toLocaleString()}</div>
                  <div className="text-muted-foreground text-[11px]">Qty: {s.quantity}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
