import { Router } from "express";
import { z } from "zod";
import { db, staffTable, staffAttendanceTable } from "@workspace/db";
import { eq, ilike, and, gte, lte, sql, asc } from "drizzle-orm";
import { getUserIdFromRequest } from "../lib/auth-context.js";

const router = Router();

// ---------------------------------------------------------------------------
// Zod bodies (self-contained — not orval-generated, since this module isn't
// in the OpenAPI spec yet. Mirrors the shape of insertStaffSchema.)
// ---------------------------------------------------------------------------
const StaffStatus = z.enum(["active", "inactive"]);

const CreateStaffBody = z.object({
  name: z.string().min(1),
  designation: z.string().min(1),
  phone: z.string().optional(),
  address: z.string().optional(),
  cnic: z.string().optional(),
  joiningDate: z.string().min(1), // YYYY-MM-DD
  baseSalary: z.number().nonnegative().default(0),
  status: StaffStatus.default("active"),
  notes: z.string().optional(),
});

const UpdateStaffBody = CreateStaffBody.partial();

const AttendanceStatus = z.enum(["present", "absent", "half_day", "leave"]);

const MarkAttendanceBody = z.object({
  date: z.string().min(1), // YYYY-MM-DD
  status: AttendanceStatus,
  note: z.string().optional(),
});

const BulkAttendanceBody = z.object({
  entries: z.array(z.object({
    date: z.string().min(1),
    status: AttendanceStatus,
    note: z.string().optional(),
  })).min(1),
});

function fmtStaff(s: typeof staffTable.$inferSelect) {
  return {
    id: s.id,
    name: s.name,
    designation: s.designation,
    phone: s.phone,
    address: s.address,
    cnic: s.cnic,
    joiningDate: s.joiningDate,
    baseSalary: parseFloat(s.baseSalary as string),
    status: s.status,
    notes: s.notes,
    createdAt: s.createdAt.toISOString(),
  };
}

function fmtAttendance(a: typeof staffAttendanceTable.$inferSelect) {
  return {
    id: a.id,
    staffId: a.staffId,
    date: a.date,
    status: a.status,
    note: a.note,
    createdAt: a.createdAt.toISOString(),
  };
}

// GET /api/staff?search=&status=
router.get("/", async (req, res): Promise<any> => {
  try {
    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;

    const conditions = [];
    if (search) conditions.push(ilike(staffTable.name, `%${search}%`));
    if (status) conditions.push(eq(staffTable.status, status));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db.select().from(staffTable).where(whereClause).orderBy(asc(staffTable.name));
    return res.json(rows.map(fmtStaff));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch staff" });
  }
});

// POST /api/staff
router.post("/", async (req, res): Promise<any> => {
  try {
    const body = CreateStaffBody.parse(req.body);
    const [staff] = await db.insert(staffTable).values({
      name: body.name,
      designation: body.designation,
      phone: body.phone ?? null,
      address: body.address ?? null,
      cnic: body.cnic ?? null,
      joiningDate: body.joiningDate,
      baseSalary: String(body.baseSalary),
      status: body.status,
      notes: body.notes ?? null,
    }).returning();
    return res.status(201).json(fmtStaff(staff));
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues });
    return res.status(500).json({ error: "Failed to create staff member" });
  }
});

// GET /api/staff/:id
router.get("/:id", async (req, res): Promise<any> => {
  try {
    const id = parseInt(req.params.id);
    const [staff] = await db.select().from(staffTable).where(eq(staffTable.id, id));
    if (!staff) return res.status(404).json({ error: "Staff member not found" });
    return res.json(fmtStaff(staff));
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch staff member" });
  }
});

// PATCH /api/staff/:id
router.patch("/:id", async (req, res): Promise<any> => {
  try {
    const id = parseInt(req.params.id);
    const body = UpdateStaffBody.parse(req.body);
    const updateData: Record<string, unknown> = { ...body };
    if (body.baseSalary !== undefined) updateData.baseSalary = String(body.baseSalary);

    const [staff] = await db.update(staffTable).set(updateData).where(eq(staffTable.id, id)).returning();
    if (!staff) return res.status(404).json({ error: "Staff member not found" });
    return res.json(fmtStaff(staff));
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues });
    return res.status(500).json({ error: "Failed to update staff member" });
  }
});

// DELETE /api/staff/:id
router.delete("/:id", async (req, res): Promise<any> => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(staffAttendanceTable).where(eq(staffAttendanceTable.staffId, id));
    await db.delete(staffTable).where(eq(staffTable.id, id));
    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to delete staff member. They may have ledger or payslip history — set status to inactive instead." });
  }
});

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

// GET /api/staff/:id/attendance?month=YYYY-MM  (calendar-grid month view)
router.get("/:id/attendance", async (req, res): Promise<any> => {
  try {
    const staffId = parseInt(req.params.id);
    const month = req.query.month as string | undefined; // YYYY-MM

    let conditions = [eq(staffAttendanceTable.staffId, staffId)];
    if (month) {
      const [year, mon] = month.split("-").map(Number);
      const start = `${month}-01`;
      const end = `${month}-${String(new Date(year, mon, 0).getDate()).padStart(2, "0")}`;
      conditions.push(gte(staffAttendanceTable.date, start), lte(staffAttendanceTable.date, end));
    }

    const rows = await db.select().from(staffAttendanceTable).where(and(...conditions)).orderBy(asc(staffAttendanceTable.date));
    return res.json(rows.map(fmtAttendance));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch attendance" });
  }
});

// POST /api/staff/:id/attendance — mark/update a single day (upsert on staff_id+date)
router.post("/:id/attendance", async (req, res): Promise<any> => {
  try {
    const staffId = parseInt(req.params.id);
    const body = MarkAttendanceBody.parse(req.body);

    const [row] = await db
      .insert(staffAttendanceTable)
      .values({ staffId, date: body.date, status: body.status, note: body.note ?? null })
      .onConflictDoUpdate({
        target: [staffAttendanceTable.staffId, staffAttendanceTable.date],
        set: { status: body.status, note: body.note ?? null },
      })
      .returning();

    return res.status(201).json(fmtAttendance(row));
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues });
    return res.status(500).json({ error: "Failed to mark attendance" });
  }
});

// POST /api/staff/:id/attendance/bulk — mark multiple days at once (backdated bulk entry)
router.post("/:id/attendance/bulk", async (req, res): Promise<any> => {
  try {
    const staffId = parseInt(req.params.id);
    const body = BulkAttendanceBody.parse(req.body);

    const results = [];
    for (const entry of body.entries) {
      const [row] = await db
        .insert(staffAttendanceTable)
        .values({ staffId, date: entry.date, status: entry.status, note: entry.note ?? null })
        .onConflictDoUpdate({
          target: [staffAttendanceTable.staffId, staffAttendanceTable.date],
          set: { status: entry.status, note: entry.note ?? null },
        })
        .returning();
      results.push(fmtAttendance(row));
    }

    return res.status(201).json({ data: results, count: results.length });
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues });
    return res.status(500).json({ error: "Failed to mark bulk attendance" });
  }
});

// DELETE /api/staff/:id/attendance/:attendanceId
router.delete("/:id/attendance/:attendanceId", async (req, res): Promise<any> => {
  try {
    const attendanceId = parseInt(req.params.attendanceId);
    await db.delete(staffAttendanceTable).where(eq(staffAttendanceTable.id, attendanceId));
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete attendance record" });
  }
});

export default router;
