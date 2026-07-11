import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionLoading } from "@/components/loading-state";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, ChevronRight, Users, Edit, Trash2 } from "lucide-react";

type Staff = {
  id: number; name: string; designation: string; phone: string | null;
  joiningDate: string; baseSalary: number; status: string;
};

export default function StaffPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [staffForm, setStaffForm] = useState<{
    name: string;
    designation: string;
    phone: string;
    joiningDate: string;
    baseSalary: string;
    status: string;
  }>({ name: "", designation: "", phone: "", joiningDate: new Date().toISOString().slice(0, 10), baseSalary: "0", status: "active" });

  const { data, isLoading } = useQuery({
    queryKey: ["staff", search],
    queryFn: () => apiGet<Staff[]>(`/api/staff?${search ? `search=${encodeURIComponent(search)}` : ""}`),
  });

  const openNewStaff = () => {
    setEditingStaff(null);
    setStaffForm({ name: "", designation: "", phone: "", joiningDate: new Date().toISOString().slice(0, 10), baseSalary: "0", status: "active" });
    setOpen(true);
  };

  const openEditStaff = (staff: Staff) => {
    setEditingStaff(staff);
    setStaffForm({ name: staff.name, designation: staff.designation, phone: staff.phone || "", joiningDate: staff.joiningDate, baseSalary: String(staff.baseSalary), status: staff.status });
    setOpen(true);
  };

  const resetForm = () => {
    setStaffForm({ name: "", designation: "", phone: "", joiningDate: new Date().toISOString().slice(0, 10), baseSalary: "0", status: "active" });
    setEditingStaff(null);
  };

  const handleSaveStaff = async () => {
    const payload = {
      name: staffForm.name,
      designation: staffForm.designation,
      phone: staffForm.phone || undefined,
      joiningDate: staffForm.joiningDate,
      baseSalary: parseFloat(staffForm.baseSalary),
      status: staffForm.status as "active" | "inactive",
    };

    if (editingStaff) {
      await apiPatch(`/api/staff/${editingStaff.id}`, payload);
    } else {
      await apiPost("/api/staff", payload);
    }

    qc.invalidateQueries({ queryKey: ["staff"] });
    setOpen(false);
    resetForm();
  };

  const handleDeleteStaff = async (id: number) => {
    if (!confirm("Delete this staff member?")) return;
    await apiDelete(`/api/staff/${id}`);
    qc.invalidateQueries({ queryKey: ["staff"] });
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Users className="w-6 h-6 text-primary" /> Staff</h1>
            <p className="text-muted-foreground text-sm mt-1">{data?.length || 0} staff members</p>
          </div>
            <Button onClick={openNewStaff} className="gap-2"><Plus className="w-4 h-4" /> Add Staff</Button>
        </div>

        <Card className="border-border bg-card">
          <CardContent className="p-0">
            {isLoading ? <SectionLoading label="Loading staff" /> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground uppercase text-xs tracking-wider">
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Designation</th>
                    <th className="px-4 py-3 text-left">Phone</th>
                    <th className="px-4 py-3 text-left">Joined</th>
                    <th className="px-4 py-3 text-right">Base Salary</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">No staff found</td></tr>
                  ) : data?.map((s) => (
                    <tr key={s.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/staff/${s.id}`} className="hover:text-primary hover:underline">{s.name}</Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{s.designation}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.phone || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.joiningDate}</td>
                      <td className="px-4 py-3 text-right">Rs {s.baseSalary.toLocaleString()}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={s.status === "active" ? "default" : "outline"} className="capitalize">{s.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Button size="sm" variant="ghost" onClick={() => openEditStaff(s)} className="hover:bg-accent w-8 h-8 p-0"><Edit className="w-4 h-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteStaff(s.id)} className="hover:bg-destructive/20 hover:text-destructive w-8 h-8 p-0"><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={(open) => { setOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader><DialogTitle>{editingStaff ? "Edit Staff Member" : "Add Staff Member"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Name *</Label>
              <Input value={staffForm.name} onChange={e => setStaffForm(f => ({ ...f, name: e.target.value }))} className="bg-background/50 border-border" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Designation *</Label>
              <Input value={staffForm.designation} onChange={e => setStaffForm(f => ({ ...f, designation: e.target.value }))} className="bg-background/50 border-border" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Phone</Label>
                <Input value={staffForm.phone} onChange={e => setStaffForm(f => ({ ...f, phone: e.target.value }))} className="bg-background/50 border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Joining Date</Label>
                <Input type="date" value={staffForm.joiningDate} onChange={e => setStaffForm(f => ({ ...f, joiningDate: e.target.value }))} className="bg-background/50 border-border" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Base Salary *</Label>
                <Input type="number" value={staffForm.baseSalary} onChange={e => setStaffForm(f => ({ ...f, baseSalary: e.target.value }))} className="bg-background/50 border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Status</Label>
                <Select value={staffForm.status} onValueChange={v => setStaffForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="bg-background/50 border-border"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }} className="border-border">Cancel</Button>
            <Button onClick={async () => {
              try {
                await handleSaveStaff();
                toast({ title: editingStaff ? "Staff updated" : "Staff member saved" });
              } catch (e: any) {
                toast({ title: editingStaff ? "Failed to update staff" : "Failed to save staff", description: e.message, variant: "destructive" });
              }
            }} disabled={!staffForm.name || !staffForm.designation || !staffForm.baseSalary} className="bg-primary hover:bg-primary/90">
              {editingStaff ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
