import assert from "node:assert/strict";
import test from "node:test";
import { calculateWeightedAverageCost, calculateDailyProfitSummary, calculateWeightedAverageCostAfterChange } from "./inventory-accounting.ts";

test("calculateWeightedAverageCost uses weighted average for purchases", () => {
  const cost = calculateWeightedAverageCost({ currentStock: 100, averageCost: 400, quantity: 50, unitCost: 500 });
  assert.equal(cost, 433.3333333333333);
});

test("calculateDailyProfitSummary uses COGS instead of purchase subtraction", () => {
  const summary = calculateDailyProfitSummary({
    sales: 5000,
    cogs: 4000,
    expenses: 500,
  });

  assert.equal(summary.grossProfit, 1000);
  assert.equal(summary.netProfit, 500);
});

test("calculateWeightedAverageCostAfterChange reverses a purchase from stock without corrupting the cost basis", () => {
  const nextCost = calculateWeightedAverageCostAfterChange({
    currentStock: 120,
    averageCost: 400,
    quantityDelta: -50,
    unitCost: 500,
  });

  assert.equal(nextCost, 328.57142857142856);
});
