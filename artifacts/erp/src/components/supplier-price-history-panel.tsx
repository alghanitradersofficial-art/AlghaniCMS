import { useSupplierPriceHistory } from "@/hooks/use-ledger";
import { History } from "lucide-react";
import { useState } from "react";

function InputDate({ label, value, onChange }: { label: string; value?: string; onChange: (v?: string) => void }) {
  return (
    <div className="text-xs">
      <div className="text-muted-foreground text-[10px]">{label}</div>
      <input type="date" value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)} className="bg-background/50 border-border text-xs h-8 px-2 rounded" />
    </div>
  );
}

interface SupplierPriceHistoryPanelProps {
  supplierId: number | undefined;
  productId: number | undefined;
}

export function SupplierPriceHistoryPanel({ supplierId, productId }: SupplierPriceHistoryPanelProps) {
  const [from, setFrom] = useState<string | undefined>(undefined);
  const [to, setTo] = useState<string | undefined>(undefined);
  const { data: history, isLoading: historyLoading } = useSupplierPriceHistory(supplierId, productId, from, to);

  if (!supplierId || !productId) {
    return (
      <div className="text-xs text-muted-foreground italic px-1">
        Select a registered supplier to see their price history for this product.
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
            <History className="w-3.5 h-3.5" /> Price History with this Supplier
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div>Last cost: <span className="font-semibold text-foreground">Rs. {history.lastCostPrice?.toLocaleString()}</span></div>
            <div>Last qty: <span className="font-semibold text-foreground">{history.lastQuantity}</span></div>
            <div>Last PO: <span className="font-mono text-primary">{history.lastPoNumber}</span></div>
            <div>{history.daysSincePurchase} days ago</div>
            <div>Lowest ever: Rs. {history.lowestCostEver?.toLocaleString()}</div>
            <div>Highest ever: Rs. {history.highestCostEver?.toLocaleString()}</div>
            <div>Avg cost: Rs. {history.averageCostPrice?.toLocaleString()}</div>
            <div>Total orders: {history.totalOrders}</div>
            <div>Total qty bought: {history.totalQuantityPurchased}</div>
            <div>Total spent: Rs. {history.totalPurchaseValue?.toLocaleString()}</div>
          </div>
        </>
      ) : (
        <div className="text-muted-foreground">No previous purchases of this product from this supplier.</div>
      )}

      {history?.previousPurchases && history.previousPurchases.length > 0 && (
        <div className="border-t border-border pt-2 space-y-2">
          <div className="font-medium text-muted-foreground text-xs">Recent Purchases</div>
          <div className="space-y-1 max-h-40 overflow-y-auto text-xs">
            {history.previousPurchases.map((p) => (
              <div key={`${p.purchaseId}-${p.purchaseDate}`} className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{p.poNumber}</div>
                  <div className="text-muted-foreground text-[11px]">{new Date(p.purchaseDate).toLocaleDateString()}</div>
                </div>
                <div className="text-right">
                  <div>Rs. {p.unitCost.toLocaleString()}</div>
                  <div className="text-muted-foreground text-[11px]">Qty: {p.quantity}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
