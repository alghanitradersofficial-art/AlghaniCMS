import { db, staffAttendanceTable } from "@workspace/db";
import { and, eq, gte, lte } from "drizzle-orm";
import { round2 } from "./ledger.js";

/**
 * Returns the number of working days in a given month (all days minus
 * Sundays, treating Sunday as the standard off day for this business).
 * If the business needs a different working-week definition later, this is
 * the single place to change it.
 */
export function getWorkingDaysInMonth(month: string): number {
  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  let workingDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, mon - 1, d);
    if (date.getDay() !== 0) workingDays++; // 0 = Sunday
  }
  return workingDays;
}

/**
 * Computes the attendance breakdown and prorated salary for a staff member
 * for a given month (format "YYYY-MM"), from their attendance records.
 * half_day counts as 0.5 present + 0.5 absent for proration purposes.
 * Does NOT write anything — pure calculation, used both for the payslip
 * preview and the final confirmed payslip.
 */
export async function calculateSalaryForMonth(params: {
  staffId: number;
  month: string; // YYYY-MM
  baseSalary: number;
}) {
  const { staffId, month, baseSalary } = params;
  const monthStart = `${month}-01`;
  const [year, mon] = month.split("-").map(Number);
  const monthEnd = `${month}-${String(new Date(year, mon, 0).getDate()).padStart(2, "0")}`;

  const records = await db
    .select()
    .from(staffAttendanceTable)
    .where(
      and(
        eq(staffAttendanceTable.staffId, staffId),
        gte(staffAttendanceTable.date, monthStart),
        lte(staffAttendanceTable.date, monthEnd),
      ),
    );

  let daysPresent = 0;
  let daysAbsent = 0;
  let daysLeave = 0;

  for (const r of records) {
    if (r.status === "present") daysPresent += 1;
    else if (r.status === "half_day") { daysPresent += 0.5; daysAbsent += 0.5; }
    else if (r.status === "absent") daysAbsent += 1;
    else if (r.status === "leave") daysLeave += 1;
  }

  const workingDays = getWorkingDaysInMonth(month);
  const proratedSalary = workingDays > 0 ? round2((baseSalary * daysPresent) / workingDays) : 0;

  return {
    staffId,
    month,
    workingDays,
    daysPresent: round2(daysPresent),
    daysAbsent: round2(daysAbsent),
    daysLeave: round2(daysLeave),
    daysRecorded: records.length,
    baseSalary: round2(baseSalary),
    proratedSalary,
  };
}
