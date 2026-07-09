import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarWidget } from "@/components/ui/calendar";
import { SectionLoading, PageLoading } from "@/components/loading-state";
import { apiGet, apiPost } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, CalendarDays, Receipt, Wallet2, ChevronLeft, ChevronRight, CalendarIcon, ReceiptText } from "lucide-react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from "date-fns";
import { cn } from "@/lib/utils";

type Staff = {
  id: number; name: string; designation: string; phone: string | null; joiningDate: string;
  baseSalary: number; status: string;
};

type Attendance = { id: number; date: string; status: string; note: string | null };

type LedgerEntry = { id: number; type: string; amount: number; runningBalance: number; description: string | null; entryDate: string };
type StaffLedgerResponse = {
  currentBalance: number; owedToStaff: number; advanceOutstanding: number;
  totalPaid: number; totalAdvances: number; totalBonus: number; totalDeductions: number; entries: LedgerEntry[];
};

const ATTENDANCE_COLORS: Record<string, string> = {
  present: "bg-emerald-500/20 text-emerald-500 border-emerald-500/40",
  absent: "bg-red-500/20 text-red-500 border-red-500/40",
  half_day: "bg-amber-500/20 text-amber-500 border-amber-500/40",
  leave: "bg-blue-500/20 text-blue-500 border-blue-500/40",
};

export default function StaffDetail() {
  const params = useParams<{ id: string }>();
  const staffId = parseInt(params.id);

  const staffQuery = useQuery({
    queryKey: ["staff-detail", staffId],
    queryFn: () => apiGet<Staff>(`/api/staff/${staffId}`),
  });

  if (staffQuery.isLoading || !staffQuery.data) {
    return <Layout><PageLoading label="Loading staff member" /></Layout>;
  }
  const staff = staffQuery.data;

  return (
    <Layout>
      <div className="space-y-6">
        <Link href="/staff">
          <Button size="sm" variant="ghost" className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Staff</Button>
        </Link>

        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{staff.name}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {staff.designation} {staff.phone ? `• ${staff.phone}` : ""} • Joined {staff.joiningDate}
            </p>
          </div>
          <Card className="border-border bg-card">
            <CardContent className="py-3 px-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Base Salary</p>
              <p className="text-lg font-bold">Rs {staff.baseSalary.toLocaleString()}/mo</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="attendance" className="w-full">
          <TabsList>
            <TabsTrigger value="attendance" className="gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> Attendance</TabsTrigger>
            <TabsTrigger value="ledger" className="gap-1.5"><Receipt className="w-3.5 h-3.5" /> Ledger</TabsTrigger>
            <TabsTrigger value="salary" className="gap-1.5"><Wallet2 className="w-3.5 h-3.5" /> Salary</TabsTrigger>
          </TabsList>

          <TabsContent value="attendance" className="mt-4">
            <AttendanceTab staffId={staffId} />
          </TabsContent>

          <TabsContent value="ledger" className="mt-4">
            <LedgerTab staffId={staffId} />
          </TabsContent>

          <TabsContent value="salary" className="mt-4">
            <SalaryTab staffId={staffId} baseSalary={staff.baseSalary} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

// ---------------------------------------------------------------------------
// Attendance — monthly calendar grid, click a day to mark status
// ---------------------------------------------------------------------------
function AttendanceTab({ staffId }: { staffId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [month, setMonth] = useState(new Date());
  const [pickerDay, setPickerDay] = useState<string | null>(null);

  const monthKey = format(month, "yyyy-MM");
  const { data, isLoading } = useQuery({
    queryKey: ["staff-attendance", staffId, monthKey],
    queryFn: () => apiGet<Attendance[]>(`/api/staff/${staffId}/attendance?month=${monthKey}`),
  });

  const byDate = new Map((data ?? []).map((a) => [a.date, a]));

  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const leadingBlanks = getDay(monthStart); // 0 = Sunday

  const markDay = async (dateStr: string, status: string) => {
    try {
      await apiPost(`/api/staff/${staffId}/attendance`, { date: dateStr, status });
      qc.invalidateQueries({ queryKey: ["staff-attendance", staffId, monthKey] });
      setPickerDay(null);
    } catch (e: any) {
      toast({ title: "Failed to mark attendance", description: e.message, variant: "destructive" });
    }
  };

  const summary = Array.from(byDate.values()).reduce(
    (acc, a) => {
      if (a.status === "present") acc.present++;
      else if (a.status === "absent") acc.absent++;
      else if (a.status === "half_day") acc.halfDay++;
      else if (a.status === "leave") acc.leave++;
      return acc;
    },
    { present: 0, absent: 0, halfDay: 0, leave: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setMonth((m) => subMonths(m, 1))}><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-sm font-semibold w-32 text-center">{format(month, "MMMM yyyy")}</span>
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setMonth((m) => addMonths(m, 1))}><ChevronRight className="w-4 h-4" /></Button>
        </div>
        <div className="flex gap-2 text-xs">
          <Badge className={ATTENDANCE_COLORS.present}>Present {summary.present}</Badge>
          <Badge className={ATTENDANCE_COLORS.absent}>Absent {summary.absent}</Badge>
          <Badge className={ATTENDANCE_COLORS.half_day}>Half {summary.halfDay}</Badge>
          <Badge className={ATTENDANCE_COLORS.leave}>Leave {summary.leave}</Badge>
        </div>
      </div>

      {isLoading ? <SectionLoading label="Loading attendance" /> : (
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <div className="grid grid-cols-7 gap-1.5 mb-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="text-center text-xs text-muted-foreground font-medium py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: leadingBlanks }).map((_, i) => <div key={`b-${i}`} />)}
              {days.map((d) => {
                const dateStr = format(d, "yyyy-MM-dd");
                const record = byDate.get(dateStr);
                return (
                  <Popover key={dateStr} open={pickerDay === dateStr} onOpenChange={(o) => setPickerDay(o ? dateStr : null)}>
                    <PopoverTrigger asChild>
                      <button
                        className={cn(
                          "aspect-square rounded-md border text-xs flex flex-col items-center justify-center gap-0.5 transition-colors hover:brightness-110",
                          record ? ATTENDANCE_COLORS[record.status] : "border-border/50 text-muted-foreground hover:bg-accent/40",
                        )}
                      >
                        <span className="font-medium">{format(d, "d")}</span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-40 p-2" align="center">
                      <div className="flex flex-col gap-1">
                        <p className="text-xs text-muted-foreground px-1 pb-1">{format(d, "d MMM yyyy")}</p>
                        {(["present", "absent", "half_day", "leave"] as const).map((s) => (
                          <Button key={s} size="sm" variant="ghost" className="justify-start capitalize h-7 text-xs" onClick={() => markDay(dateStr, s)}>
                            {s.replace("_", " ")}
                          </Button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ledger — table + add entry form with date picker
// ---------------------------------------------------------------------------
function LedgerTab({ staffId }: { staffId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["staff-ledger", staffId],
    queryFn: () => apiGet<StaffLedgerResponse>(`/api/staff/${staffId}/ledger`),
  });

  if (isLoading) return <SectionLoading label="Loading ledger" />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Owed to Staff" value={data.owedToStaff} accent="amber" />
        <StatCard label="Advance Outstanding" value={data.advanceOutstanding} />
        <StatCard label="Total Paid" value={data.totalPaid} accent="emerald" />
        <StatCard label="Total Bonus" value={data.totalBonus} />
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5"><Plus className="w-4 h-4" /> Add Ledger Entry</Button>
      </div>

      <Card className="border-border bg-card">
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground uppercase text-xs tracking-wider">
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Description</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">No ledger entries yet</td></tr>
              ) : data.entries.map((e) => (
                <tr key={e.id} className="border-b border-border/50 hover:bg-accent/30">
                  <td className="px-4 py-3 text-muted-foreground">{format(new Date(e.entryDate), "d MMM yyyy")}</td>
                  <td className="px-4 py-3"><Badge variant="outline" className="capitalize">{e.type.replace("_", " ")}</Badge></td>
                  <td className="px-4 py-3 text-muted-foreground">{e.description || "—"}</td>
                  <td className={cn("px-4 py-3 text-right font-medium", e.amount < 0 ? "text-emerald-500" : "text-foreground")}>
                    {e.amount < 0 ? "-" : "+"}Rs {Math.abs(e.amount).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">Rs {e.runningBalance.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <AddLedgerEntryForm
          onSubmit={async (payload) => {
            try {
              await apiPost(`/api/staff/${staffId}/ledger`, payload);
              toast({ title: "Ledger entry added" });
              qc.invalidateQueries({ queryKey: ["staff-ledger", staffId] });
              setAddOpen(false);
            } catch (e: any) {
              toast({ title: "Failed to add entry", description: e.message, variant: "destructive" });
            }
          }}
        />
      </Dialog>
    </div>
  );
}

function DatePickerField({ date, onChange, endMonth }: { date: Date; onChange: (d: Date) => void; endMonth?: Date }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start gap-2 font-normal">
          <CalendarIcon className="w-4 h-4" /> {format(date, "d MMM yyyy")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <CalendarWidget
          mode="single"
          selected={date}
          onSelect={(d) => { if (d) { onChange(d); setOpen(false); } }}
          captionLayout="dropdown"
          startMonth={new Date(2015, 0)}
          endMonth={endMonth ?? new Date()}
        />
      </PopoverContent>
    </Popover>
  );
}

function AddLedgerEntryForm({ onSubmit }: { onSubmit: (payload: any) => void }) {
  const [type, setType] = useState<"advance" | "deduction" | "bonus" | "adjustment">("advance");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState<Date>(new Date());

  return (
    <DialogContent className="bg-card border-border max-w-md">
      <DialogHeader><DialogTitle>Add Ledger Entry</DialogTitle></DialogHeader>
      <div className="grid gap-3 py-2">
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as any)}>
            <SelectTrigger className="bg-background/50 border-border"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="advance">Advance / Loan Given</SelectItem>
              <SelectItem value="deduction">Deduction</SelectItem>
              <SelectItem value="bonus">Bonus</SelectItem>
              <SelectItem value="adjustment">Adjustment</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Amount *</Label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="bg-background/50 border-border" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Date</Label>
          <DatePickerField date={date} onChange={setDate} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Note</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} className="bg-background/50 border-border" />
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={!amount}
          onClick={() => onSubmit({ type, amount: parseFloat(amount), description: description || undefined, entryDate: date.toISOString() })}
        >
          Add Entry
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: "emerald" | "amber" }) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={cn("text-xl font-bold mt-1", accent === "emerald" && "text-emerald-500", accent === "amber" && "text-amber-500")}>
          Rs {value.toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Salary — monthly payslip generator with breakdown before confirming
// ---------------------------------------------------------------------------
function SalaryTab({ staffId, baseSalary }: { staffId: number; baseSalary: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const [bonus, setBonus] = useState("0");
  const [deduction, setDeduction] = useState("0");
  const [markPaid, setMarkPaid] = useState(true);

  const previewQuery = useQuery({
    queryKey: ["staff-salary-preview", staffId, month],
    queryFn: () => apiGet<any>(`/api/staff/${staffId}/salary/preview?month=${month}`),
  });

  const historyQuery = useQuery({
    queryKey: ["staff-salary-history", staffId],
    queryFn: () => apiGet<any[]>(`/api/staff/${staffId}/salary/history`),
  });

  const preview = previewQuery.data;
  const netSalary = preview ? Math.max(0, preview.proratedSalary + (parseFloat(bonus) || 0) - (parseFloat(deduction) || 0)) : 0;

  const confirm = async () => {
    try {
      await apiPost(`/api/staff/${staffId}/salary/confirm`, {
        month, bonus: parseFloat(bonus) || 0, deduction: parseFloat(deduction) || 0, markAsPaid: markPaid,
      });
      toast({ title: "Payslip confirmed" });
      qc.invalidateQueries({ queryKey: ["staff-salary-preview", staffId, month] });
      qc.invalidateQueries({ queryKey: ["staff-salary-history", staffId] });
      qc.invalidateQueries({ queryKey: ["staff-ledger", staffId] });
    } catch (e: any) {
      toast({ title: "Failed to confirm payslip", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Month</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44 bg-background/50 border-border" />
          </div>

          {previewQuery.isLoading ? <SectionLoading label="Calculating salary" /> : preview && (
            <>
              {preview.alreadyFinalized && (
                <Badge variant="outline" className="text-amber-500 border-amber-500/40">Payslip already finalized for this month</Badge>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Working Days" value={preview.workingDays} />
                <StatCard label="Days Present" value={preview.daysPresent} accent="emerald" />
                <StatCard label="Days Absent" value={preview.daysAbsent} />
                <StatCard label="Base Salary" value={preview.baseSalary} />
              </div>

              <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Prorated Salary ({preview.daysPresent}/{preview.workingDays} days)</span><span className="font-medium">Rs {preview.proratedSalary.toLocaleString()}</span></div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Bonus</span>
                  <Input type="number" value={bonus} onChange={(e) => setBonus(e.target.value)} className="w-32 h-8 text-right bg-background/50 border-border" />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Deduction</span>
                  <Input type="number" value={deduction} onChange={(e) => setDeduction(e.target.value)} className="w-32 h-8 text-right bg-background/50 border-border" />
                </div>
                <div className="border-t border-border pt-2 flex justify-between text-base font-bold">
                  <span>Net Salary</span><span>Rs {netSalary.toLocaleString()}</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input type="checkbox" checked={markPaid} onChange={(e) => setMarkPaid(e.target.checked)} className="rounded border-border" />
                  Mark as paid immediately
                </label>
                <Button disabled={preview.alreadyFinalized} onClick={confirm} className="gap-1.5"><ReceiptText className="w-4 h-4" /> Confirm Payslip</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div>
        <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Payslip History</h3>
        <Card className="border-border bg-card">
          <CardContent className="p-0">
            {historyQuery.isLoading ? <SectionLoading label="Loading history" /> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground uppercase text-xs tracking-wider">
                    <th className="px-4 py-3 text-left">Month</th>
                    <th className="px-4 py-3 text-right">Present</th>
                    <th className="px-4 py-3 text-right">Prorated</th>
                    <th className="px-4 py-3 text-right">Bonus</th>
                    <th className="px-4 py-3 text-right">Deduction</th>
                    <th className="px-4 py-3 text-right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {(historyQuery.data ?? []).length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No payslips yet</td></tr>
                  ) : historyQuery.data!.map((p) => (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-accent/30">
                      <td className="px-4 py-3 font-medium">{p.month}</td>
                      <td className="px-4 py-3 text-right">{p.daysPresent}/{p.workingDays}</td>
                      <td className="px-4 py-3 text-right">Rs {p.proratedSalary.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-emerald-500">+{p.bonus.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-red-500">-{p.deduction.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-semibold">Rs {p.netSalary.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
