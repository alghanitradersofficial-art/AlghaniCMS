type PoolLike = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

export type ReportPreset =
  | "today"
  | "yesterday"
  | "last7days"
  | "thisweek"
  | "lastweek"
  | "thismonth"
  | "lastmonth"
  | "thisyear"
  | "lastyear"
  | "week"
  | "custom"
  | "all";

export type ReportRangeValue = {
  preset: ReportPreset;
  from?: Date | string;
  to?: Date | string;
};

export type ReportRange = {
  preset: ReportPreset;
  start: Date | null;
  end: Date | null;
  previousStart: Date | null;
  previousEnd: Date | null;
  label: string;
};

export type ReportSummary = {
  range: ReportPreset;
  label: string;
  current: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    grossMargin: number;
    expenses: number;
    netProfit: number;
    netMargin: number;
    inventoryValue: number;
    inventoryQuantity: number;
    totalProducts: number;
    salesCount: number;
    invoices: number;
    customers: number;
    suppliers: number;
  };
  previous: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    grossMargin: number;
    expenses: number;
    netProfit: number;
    netMargin: number;
    inventoryValue: number;
    inventoryQuantity: number;
    totalProducts: number;
    salesCount: number;
    invoices: number;
    customers: number;
    suppliers: number;
  };
  comparison: {
    revenue: number;
    revenuePct: number;
    cogs: number;
    cogsPct: number;
    grossProfit: number;
    grossProfitPct: number;
    expenses: number;
    expensesPct: number;
    netProfit: number;
    netProfitPct: number;
    inventoryValue: number;
    inventoryValuePct: number;
  };
};

function toStartOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function toEndOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(23, 59, 59, 999);
  return next;
}

function startOfWeek(value: Date) {
  const next = new Date(value);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfWeek(value: Date) {
  const next = startOfWeek(value);
  next.setDate(next.getDate() + 6);
  next.setHours(23, 59, 59, 999);
  return next;
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function endOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth() + 1, 0, 23, 59, 59, 999);
}

function startOfYear(value: Date) {
  return new Date(value.getFullYear(), 0, 1);
}

function endOfYear(value: Date) {
  return new Date(value.getFullYear(), 11, 31, 23, 59, 59, 999);
}

function previousDay(value: Date) {
  const next = new Date(value);
  next.setDate(next.getDate() - 1);
  return next;
}

function previousWeek(value: Date) {
  const next = startOfWeek(value);
  next.setDate(next.getDate() - 7);
  return next;
}

function previousMonth(value: Date) {
  const next = startOfMonth(value);
  next.setMonth(next.getMonth() - 1);
  return next;
}

function previousYear(value: Date) {
  const next = startOfYear(value);
  next.setFullYear(next.getFullYear() - 1);
  return next;
}

function toDate(value?: Date | string) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function calculatePercentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

function parseNumber(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function quoteSqlIdentifier(value: string) {
  return value
    .split(".")
    .map((part) => `"${part.replace(/"/g, '""')}"`)
    .join(".");
}

function buildDateClauses(start: Date | null, end: Date | null, column: string, useDateOnly: boolean) {
  const params: unknown[] = [];
  let clause = "";
  const quotedColumn = quoteSqlIdentifier(column);
  if (start) {
    clause += ` AND ${quotedColumn} ${useDateOnly ? "::date" : ""} >= $${params.length + 1}`;
    params.push(start.toISOString());
  }
  if (end) {
    clause += ` AND ${quotedColumn} ${useDateOnly ? "::date" : ""} <= $${params.length + 1}`;
    params.push(end.toISOString());
  }
  return { clause, params };
}

export function resolveReportRange(value: ReportRangeValue): ReportRange {
  const now = new Date();
  const preset = value.preset || "all";

  const normalizePreset = preset === "week" ? "thisweek" : preset;

  const from = toDate(value.from);
  const to = toDate(value.to);

  let start: Date | null = null;
  let end: Date | null = null;
  let previousStart: Date | null = null;
  let previousEnd: Date | null = null;
  let label = "All Time";

  if (normalizePreset === "custom" && from && to) {
    start = toStartOfDay(from);
    end = toEndOfDay(to);
    const duration = end.getTime() - start.getTime();
    previousStart = new Date(start.getTime() - duration - 86400000);
    previousEnd = new Date(start.getTime() - 86400000);
    label = `${from.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} – ${to.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  } else if (normalizePreset === "today") {
    start = toStartOfDay(now);
    end = toEndOfDay(now);
    previousStart = toStartOfDay(previousDay(now));
    previousEnd = toEndOfDay(previousDay(now));
    label = "Today";
  } else if (normalizePreset === "yesterday") {
    const yesterday = previousDay(now);
    start = toStartOfDay(yesterday);
    end = toEndOfDay(yesterday);
    previousStart = toStartOfDay(previousDay(yesterday));
    previousEnd = toEndOfDay(previousDay(yesterday));
    label = "Yesterday";
  } else if (normalizePreset === "last7days") {
    end = toEndOfDay(now);
    start = new Date(now);
    start.setDate(start.getDate() - 6);
    start = toStartOfDay(start);
    previousEnd = new Date(start.getTime() - 86400000);
    previousStart = new Date(previousEnd.getTime() - (6 * 24 * 60 * 60 * 1000));
    label = "Last 7 Days";
  } else if (normalizePreset === "thisweek") {
    start = startOfWeek(now);
    end = endOfWeek(now);
    previousStart = previousWeek(start);
    previousEnd = endOfWeek(previousWeek(start));
    label = "This Week";
  } else if (normalizePreset === "lastweek") {
    const lastWeekStart = previousWeek(now);
    start = startOfWeek(lastWeekStart);
    end = endOfWeek(lastWeekStart);
    previousStart = previousWeek(start);
    previousEnd = endOfWeek(previousWeek(start));
    label = "Last Week";
  } else if (normalizePreset === "thismonth") {
    start = startOfMonth(now);
    end = endOfMonth(now);
    previousStart = startOfMonth(previousMonth(now));
    previousEnd = endOfMonth(previousMonth(now));
    label = "This Month";
  } else if (normalizePreset === "lastmonth") {
    const lastMonth = previousMonth(now);
    start = startOfMonth(lastMonth);
    end = endOfMonth(lastMonth);
    previousStart = startOfMonth(previousMonth(lastMonth));
    previousEnd = endOfMonth(previousMonth(lastMonth));
    label = "Last Month";
  } else if (normalizePreset === "thisyear") {
    start = startOfYear(now);
    end = endOfYear(now);
    previousStart = startOfYear(previousYear(now));
    previousEnd = endOfYear(previousYear(now));
    label = "This Year";
  } else if (normalizePreset === "lastyear") {
    const lastYear = previousYear(now);
    start = startOfYear(lastYear);
    end = endOfYear(lastYear);
    previousStart = startOfYear(previousYear(lastYear));
    previousEnd = endOfYear(previousYear(lastYear));
    label = "Last Year";
  } else {
    label = "All Time";
  }

  return { preset: normalizePreset as ReportPreset, start, end, previousStart, previousEnd, label };
}

async function fetchPeriodMetrics(pool: PoolLike, start: Date | null, end: Date | null) {
  const salesClause = buildDateClauses(start, end, "s.sale_date", false);
  const expenseClause = buildDateClauses(start, end, "date", true);
  const salesQuery = `
    SELECT
      COALESCE(SUM(total::numeric), 0) AS revenue,
      COUNT(*) AS invoices,
      COUNT(CASE WHEN status != 'cancelled' THEN 1 END) AS sales_count
    FROM sales s
    WHERE status != 'cancelled'${salesClause.clause}
  `;
  const cogsQuery = `
    SELECT COALESCE(SUM((item->>'quantity')::numeric * p.cost_price::numeric), 0) AS cogs
    FROM sales s
    LEFT JOIN LATERAL jsonb_array_elements(s.items) AS item ON TRUE
    LEFT JOIN products p ON (item->>'productId')::int = p.id
    WHERE s.status != 'cancelled'${salesClause.clause}
  `;
  const expensesQuery = `
    SELECT COALESCE(SUM(amount::numeric), 0) AS expenses
    FROM expenses
    WHERE 1 = 1${expenseClause.clause}
  `;
  const inventoryQuery = `
    SELECT
      COALESCE(SUM(current_stock::numeric), 0) AS inventory_quantity,
      COALESCE(SUM(current_stock::numeric * cost_price::numeric), 0) AS inventory_value,
      COUNT(*) AS total_products
    FROM products
  `;
  const countsQuery = `
    SELECT
      (SELECT COUNT(*) FROM customers) AS customers,
      (SELECT COUNT(*) FROM suppliers) AS suppliers
  `;

  const [salesRes, cogsRes, expensesRes, inventoryRes, countsRes] = await Promise.all([
    pool.query(salesQuery, salesClause.params),
    pool.query(cogsQuery, salesClause.params),
    pool.query(expensesQuery, expenseClause.params),
    pool.query(inventoryQuery),
    pool.query(countsQuery),
  ]);

  const revenue = parseNumber(salesRes.rows[0]?.revenue);
  const invoices = parseNumber(salesRes.rows[0]?.invoices);
  const salesCount = parseNumber(salesRes.rows[0]?.sales_count);
  const cogs = parseNumber(cogsRes.rows[0]?.cogs);
  const expenses = parseNumber(expensesRes.rows[0]?.expenses);
  const inventoryQuantity = parseNumber(inventoryRes.rows[0]?.inventory_quantity);
  const inventoryValue = parseNumber(inventoryRes.rows[0]?.inventory_value);
  const totalProducts = parseNumber(inventoryRes.rows[0]?.total_products);
  const customers = parseNumber(countsRes.rows[0]?.customers);
  const suppliers = parseNumber(countsRes.rows[0]?.suppliers);
  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - expenses;
  const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  return {
    revenue,
    cogs,
    grossProfit,
    grossMargin,
    expenses,
    netProfit,
    netMargin,
    inventoryValue,
    inventoryQuantity,
    totalProducts,
    salesCount,
    invoices,
    customers,
    suppliers,
  };
}

export async function buildFinancialReportSummary(pool: PoolLike, value: ReportRangeValue): Promise<ReportSummary> {
  const range = resolveReportRange(value);
  const [current, previous] = await Promise.all([
    fetchPeriodMetrics(pool, range.start, range.end),
    fetchPeriodMetrics(pool, range.previousStart, range.previousEnd),
  ]);

  const comparison = {
    revenue: current.revenue - previous.revenue,
    revenuePct: calculatePercentChange(current.revenue, previous.revenue),
    cogs: current.cogs - previous.cogs,
    cogsPct: calculatePercentChange(current.cogs, previous.cogs),
    grossProfit: current.grossProfit - previous.grossProfit,
    grossProfitPct: calculatePercentChange(current.grossProfit, previous.grossProfit),
    expenses: current.expenses - previous.expenses,
    expensesPct: calculatePercentChange(current.expenses, previous.expenses),
    netProfit: current.netProfit - previous.netProfit,
    netProfitPct: calculatePercentChange(current.netProfit, previous.netProfit),
    inventoryValue: current.inventoryValue - previous.inventoryValue,
    inventoryValuePct: calculatePercentChange(current.inventoryValue, previous.inventoryValue),
  };

  return {
    range: range.preset,
    label: range.label,
    current,
    previous,
    comparison,
  };
}
