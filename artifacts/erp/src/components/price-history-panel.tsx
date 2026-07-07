import { usePriceHistory, usePriceSuggestion } from "@/hooks/use-ledger";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingUp, TrendingDown, History } from "lucide-react";

interface PriceHistoryPanelProps {
  customerId: number | undefined;
  productId: number | undefined;
  proposedPrice: number;
}

export function PriceHistoryPanel({ customerId, productId, proposedPrice }: PriceHistoryPanelProps) {
  const { data: history, isLoading: historyLoading } = usePriceHistory(customerId, productId);
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
          {suggestion.warnings.map((w, i) => (
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
    </div>
  );
}
