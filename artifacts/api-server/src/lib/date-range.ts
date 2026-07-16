/**
 * Resolves a `range` query param (today | yesterday | last7days | thisweek |
 * lastweek | thismonth | lastmonth | thisyear | lastyear | all | custom)
 * plus optional `from`/`to` into a concrete [start, end] Date pair.
 *
 * This mirrors the presets in the frontend's shared DateRangeSelector
 * component (artifacts/erp/src/components/date-range-selector.tsx) so every
 * date-range-aware endpoint stays consistent. Originally duplicated inline
 * in dashboard.ts — extracted here so new endpoints (e.g. cash-in-hand
 * reporting) don't need a fourth copy.
 */
export function resolveRange(req: import("express").Request): { start: Date | null; end: Date | null } {
  const range = (req.query.range as string) || "all";
  const now = new Date();

  if (range === "custom") {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    return {
      start: from ? new Date(from) : null,
      end: to ? new Date(new Date(to).setHours(23, 59, 59, 999)) : null,
    };
  }

  if (range === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { start, end: now };
  }

  if (range === "yesterday") {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    return { start: yesterday, end: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999) };
  }

  if (range === "last7days") {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }

  if (range === "thisweek" || range === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }

  if (range === "lastweek") {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay() - 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (range === "thismonth" || range === "month") {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
  }

  if (range === "lastmonth") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (range === "thisyear" || range === "year") {
    return { start: new Date(now.getFullYear(), 0, 1), end: now };
  }

  if (range === "lastyear") {
    const start = new Date(now.getFullYear() - 1, 0, 1);
    const end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
    return { start, end };
  }

  return { start: null, end: null }; // "all"
}

/** Which bucket size to group a resolved range into for a running-balance series. */
export type CashBucket = "daily" | "weekly" | "monthly";

/** Picks a sensible default bucket size for a given preset, mirroring reports.ts period defaults. */
export function defaultBucketForRange(range: string): CashBucket {
  if (range === "today" || range === "yesterday" || range === "last7days" || range === "thisweek" || range === "lastweek") return "daily";
  if (range === "thismonth" || range === "lastmonth") return "daily";
  if (range === "thisyear" || range === "lastyear") return "monthly";
  return "daily";
}
