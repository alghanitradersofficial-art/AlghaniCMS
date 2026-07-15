export type DailyHistoryLedgerEntry = {
  date: Date;
  type: string;
  amount: string | number | null | undefined;
  direction: string;
  note?: string | null;
};

export type DailyHistoryDay = {
  date: string;
  sales: number;
  purchases: number;
  expenses: number;
  totalIn: number;
  totalOut: number;
  profit: number;
  cashFlow: number;
  cashInHand: number;
  cumulativeProfit: number;
  transactionCount: number;
  entries: Array<{
    type: string;
    amount: number;
    direction: string;
    note: string | null | undefined;
  }>;
};

export type DailyHistoryResult = {
  year: number;
  month: number;
  days: DailyHistoryDay[];
};

function toNumber(value: string | number | null | undefined) {
  const numeric = typeof value === "string" ? Number.parseFloat(value) : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatDayKey(date: Date) {
  const localDate = new Date(date);
  return `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, "0")}-${String(localDate.getDate()).padStart(2, "0")}`;
}

export function buildDailyHistoryFromLedgerEntries(entries: DailyHistoryLedgerEntry[], opts: { year: number; month: number; includeEmptyDays?: boolean }): DailyHistoryResult {
  const byDay = new Map<string, DailyHistoryDay>();
  const daysInMonth = opts.includeEmptyDays ? new Date(opts.year, opts.month, 0).getDate() : 0;

  if (opts.includeEmptyDays) {
    for (let index = 1; index <= daysInMonth; index += 1) {
      const seedDate = new Date(opts.year, opts.month - 1, index);
      const key = formatDayKey(seedDate);
      byDay.set(key, {
        date: key,
        sales: 0,
        purchases: 0,
        expenses: 0,
        totalIn: 0,
        totalOut: 0,
        profit: 0,
        cashFlow: 0,
        cashInHand: 0,
        cumulativeProfit: 0,
        transactionCount: 0,
        entries: [],
      });
    }
  }

  for (const entry of entries) {
    const dayKey = formatDayKey(entry.date);
    if (!byDay.has(dayKey)) {
      byDay.set(dayKey, {
        date: dayKey,
        sales: 0,
        purchases: 0,
        expenses: 0,
        totalIn: 0,
        totalOut: 0,
        profit: 0,
        cashFlow: 0,
        cashInHand: 0,
        cumulativeProfit: 0,
        transactionCount: 0,
        entries: [],
      });
    }

    const day = byDay.get(dayKey)!;
    const amount = toNumber(entry.amount);
    day.transactionCount += 1;
    day.entries.push({
      type: entry.type,
      amount,
      direction: entry.direction,
      note: entry.note ?? null,
    });

    if (entry.direction === "credit") {
      day.totalIn += amount;
    } else {
      day.totalOut += amount;
    }

    if (entry.type === "sale") day.sales += amount;
    if (entry.type === "purchase") day.purchases += amount;
    if (entry.type === "expense") day.expenses += amount;
  }

  const days = Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
  let runningCash = 0;
  let runningProfit = 0;

  for (const day of days) {
    const cashFlow = day.totalIn - day.totalOut;
    day.cashFlow = cashFlow;
    day.profit = day.sales - day.purchases - day.expenses;
    runningCash += cashFlow;
    runningProfit += day.profit;
    day.cashInHand = runningCash;
    day.cumulativeProfit = runningProfit;
  }

  return { year: opts.year, month: opts.month, days };
}
