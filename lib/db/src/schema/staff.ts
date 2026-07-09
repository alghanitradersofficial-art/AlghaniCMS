import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  numeric,
  index,
  unique,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// Staff (HR employees) — distinct from `users` (system login accounts).
// `users` controls who can log into the ERP; `staffTable` tracks people who
// work at Al Ghani Traders for attendance/salary/ledger purposes, whether or
// not they ever get a login. A staff member MAY optionally be linked to a
// user account later, but that's out of scope here.
// ---------------------------------------------------------------------------
export const staffTable = pgTable(
  "staff",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    designation: text("designation").notNull(), // role/title, e.g. "Warehouse Helper"
    phone: text("phone"),
    address: text("address"),
    cnic: text("cnic"),
    joiningDate: text("joining_date").notNull(), // YYYY-MM-DD
    baseSalary: numeric("base_salary", { precision: 12, scale: 2 }).notNull().default("0"),
    status: text("status").notNull().default("active"), // active | inactive
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("staff_status_idx").on(t.status),
  ],
);

export type Staff = typeof staffTable.$inferSelect;
export const insertStaffSchema = createInsertSchema(staffTable).omit({ id: true, createdAt: true });
export type InsertStaff = z.infer<typeof insertStaffSchema>;

// ---------------------------------------------------------------------------
// Attendance — one row per staff member per day.
// status: "present" | "absent" | "half_day" | "leave"
// ---------------------------------------------------------------------------
export const staffAttendanceTable = pgTable(
  "staff_attendance",
  {
    id: serial("id").primaryKey(),
    staffId: integer("staff_id").notNull().references(() => staffTable.id),
    date: text("date").notNull(), // YYYY-MM-DD
    status: text("status").notNull().default("present"),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("staff_attendance_staff_date_unique").on(t.staffId, t.date),
    index("staff_attendance_staff_idx").on(t.staffId, t.date),
    index("staff_attendance_date_idx").on(t.date),
  ],
);

export type StaffAttendance = typeof staffAttendanceTable.$inferSelect;
export const insertStaffAttendanceSchema = createInsertSchema(staffAttendanceTable).omit({ id: true, createdAt: true });
export type InsertStaffAttendance = z.infer<typeof insertStaffAttendanceSchema>;

// ---------------------------------------------------------------------------
// Staff Ledger (Khata) — immutable entry log, same pattern as
// customer_ledger_entries. Source of truth for money owed to/by a staff
// member (salary payments, advances/loans, deductions, bonuses).
// Sign convention: positive = increases what we owe the staff member
// (e.g. a finalized payslip, a bonus). Negative = decreases what we owe
// (e.g. a salary payment made, an advance given, a deduction).
// type: "salary_payment" | "advance" | "deduction" | "bonus" | "adjustment" | "opening_balance"
// ---------------------------------------------------------------------------
export const staffLedgerEntriesTable = pgTable(
  "staff_ledger_entries",
  {
    id: serial("id").primaryKey(),
    staffId: integer("staff_id").notNull().references(() => staffTable.id),
    type: text("type").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    runningBalance: numeric("running_balance", { precision: 14, scale: 2 }).notNull(),
    payslipId: integer("payslip_id"),
    description: text("description"),
    createdByUserId: integer("created_by_user_id"),
    entryDate: timestamp("entry_date", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("staff_ledger_staff_date_idx").on(t.staffId, t.entryDate),
    index("staff_ledger_staff_id_idx").on(t.staffId, t.id),
  ],
);

export type StaffLedgerEntry = typeof staffLedgerEntriesTable.$inferSelect;
export const insertStaffLedgerEntrySchema = createInsertSchema(staffLedgerEntriesTable).omit({ id: true, createdAt: true });
export type InsertStaffLedgerEntry = z.infer<typeof insertStaffLedgerEntrySchema>;

// ---------------------------------------------------------------------------
// Payslips — one row per (staff, month) once finalized/confirmed. Holds the
// full calculation breakdown so it can be displayed/reprinted later without
// recomputing (attendance could theoretically change after the fact, but a
// confirmed payslip is a frozen snapshot).
// ---------------------------------------------------------------------------
export const staffPayslipsTable = pgTable(
  "staff_payslips",
  {
    id: serial("id").primaryKey(),
    staffId: integer("staff_id").notNull().references(() => staffTable.id),
    month: text("month").notNull(), // YYYY-MM
    baseSalary: numeric("base_salary", { precision: 12, scale: 2 }).notNull(),
    workingDays: integer("working_days").notNull(),
    daysPresent: numeric("days_present", { precision: 6, scale: 2 }).notNull(), // half-days count as 0.5
    daysAbsent: numeric("days_absent", { precision: 6, scale: 2 }).notNull().default("0"),
    daysLeave: numeric("days_leave", { precision: 6, scale: 2 }).notNull().default("0"),
    proratedSalary: numeric("prorated_salary", { precision: 12, scale: 2 }).notNull(),
    bonus: numeric("bonus", { precision: 12, scale: 2 }).notNull().default("0"),
    deduction: numeric("deduction", { precision: 12, scale: 2 }).notNull().default("0"),
    netSalary: numeric("net_salary", { precision: 12, scale: 2 }).notNull(),
    notes: text("notes"),
    createdByUserId: integer("created_by_user_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("staff_payslips_staff_month_unique").on(t.staffId, t.month),
    index("staff_payslips_staff_idx").on(t.staffId, t.month),
  ],
);

export type StaffPayslip = typeof staffPayslipsTable.$inferSelect;
export const insertStaffPayslipSchema = createInsertSchema(staffPayslipsTable).omit({ id: true, createdAt: true });
export type InsertStaffPayslip = z.infer<typeof insertStaffPayslipSchema>;
