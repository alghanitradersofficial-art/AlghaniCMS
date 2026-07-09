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
import { apiGet, apiPost } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, ChevronRight, Users } from "lucide-react";

type Staff = {
  id: number; name: string; designation: string; phone: string | null;
  joiningDate: string; baseSalary: number; status: string;
};

export default function StaffPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["staff", search],
    queryFn: () => apiGet<Staff[]>(`/api/staff?${search ? `search=${encodeURIComponent(search)}` : ""}`),
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Users className="w-6 h-6 text-primary" /> Staff</h1>
            <p className="text-muted-foreground text-sm mt-1">{data?.length || 0} staff members</p>
          </div>
          <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="w-4 h-4" /> Add Staff</Button>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search staff..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-card border-border" />
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
                    <th className="px-4 py-3 text-center">View</th>
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
                        <Link href={`/staff/${s.id}`}>
                          <Button size="sm" variant="ghost" className="w-8 h-8 p-0"><ChevronRight className="w-4 h-4" /></Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <AddStaffForm
          onSubmit={async (payload) => {
            try {
              await apiPost("/api/staff", payload);
              toast({ title: "Staff member added" });
              qc.invalidateQueries({ queryKey: ["staff"] });
              setOpen(false);
            } catch (e: any) {
              toast({ title: "Failed to add staff", description: e.message, variant: "destructive" });
            }
          }}
        />
      </Dialog>
    </Layout>
  );
}

function AddStaffForm({ onSubmit }: { onSubmit: (payload: any) => void }) {
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [phone, setPhone] = useState("");
  const [joiningDate, setJoiningDate] = useState(new Date().toISOString().slice(0, 10));
  const [baseSalary, setBaseSalary] = useState("");
  const [status, setStatus] = useState("active");

  return (
    <DialogContent className="bg-card border-border max-w-md">
      <DialogHeader><DialogTitle>Add Staff Member</DialogTitle></DialogHeader>
      <div className="grid gap-3 py-2">
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Name *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-background/50 border-border" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Designation *</Label>
          <Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Warehouse Helper" className="bg-background/50 border-border" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-background/50 border-border" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Joining Date</Label>
            <Input type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} className="bg-background/50 border-border" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Base Salary *</Label>
            <Input type="number" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} className="bg-background/50 border-border" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="bg-background/50 border-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={!name || !designation || !baseSalary}
          onClick={() => onSubmit({ name, designation, phone: phone || undefined, joiningDate, baseSalary: parseFloat(baseSalary), status })}
        >
          Add Staff Member
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
