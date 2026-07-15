import assert from "node:assert/strict";
import test from "node:test";
import { buildDailyHistoryFromLedgerEntries } from "./daily-history.ts";

test("buildDailyHistoryFromLedgerEntries produces daily totals with running balances", () => {
  const ledgerEntries = [
    { date: new Date("2026-07-01T10:00:00.000Z"), type: "sale", amount: "120.50", direction: "credit", note: "Sale A" },
    { date: new Date("2026-07-01T11:00:00.000Z"), type: "expense", amount: "20.00", direction: "debit", note: "Rent" },
    { date: new Date("2026-07-02T09:30:00.000Z"), type: "purchase", amount: "35.25", direction: "debit", note: "Stock" },
  ];

  const result = buildDailyHistoryFromLedgerEntries(ledgerEntries, { year: 2026, month: 7 });

  assert.equal(result.days.length, 2);
  assert.equal(result.days[0].sales, 120.5);
  assert.equal(result.days[0].expenses, 20);
  assert.equal(result.days[0].profit, 100.5);
  assert.equal(result.days[0].cashFlow, 100.5);
  assert.equal(result.days[0].cashInHand, 100.5);
  assert.equal(result.days[1].purchases, 35.25);
  assert.equal(result.days[1].profit, -35.25);
  assert.equal(result.days[1].cashFlow, -35.25);
  assert.equal(result.days[1].cashInHand, 65.25);
  assert.equal(result.days[1].cumulativeProfit, 65.25);
});
