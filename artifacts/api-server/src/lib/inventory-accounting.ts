export type InventoryCostUpdate = {
  currentStock: number;
  averageCost: number;
  quantity: number;
  unitCost: number;
};

export type ProfitSummary = {
  sales: number;
  cogs: number;
  expenses: number;
  grossProfit: number;
  netProfit: number;
};

export function calculateWeightedAverageCost(params: InventoryCostUpdate) {
  const openingStock = Math.max(0, params.currentStock);
  const openingValue = openingStock * params.averageCost;
  const incomingValue = params.quantity * params.unitCost;
  const totalQuantity = openingStock + params.quantity;
  return totalQuantity > 0 ? (openingValue + incomingValue) / totalQuantity : params.averageCost;
}

export function calculateDailyProfitSummary(params: { sales: number; cogs: number; expenses: number }): ProfitSummary {
  return {
    sales: params.sales,
    cogs: params.cogs,
    expenses: params.expenses,
    grossProfit: params.sales - params.cogs,
    netProfit: params.sales - params.cogs - params.expenses,
  };
}

export function calculateWeightedAverageCostAfterChange(params: {
  currentStock: number;
  averageCost: number;
  quantityDelta: number;
  unitCost: number;
}) {
  const currentStock = Math.max(0, params.currentStock);
  const currentValue = currentStock * params.averageCost;
  const nextStock = Math.max(0, currentStock + params.quantityDelta);
  const deltaValue = params.quantityDelta * params.unitCost;
  const nextValue = currentValue + deltaValue;

  if (nextStock <= 0) return params.averageCost;
  return nextValue / nextStock;
}
