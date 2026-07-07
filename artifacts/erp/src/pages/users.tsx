import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGetUsers, useCreateUser, useUpdateUser, useDeleteUser, getGetUsersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2, Users2 } from "lucide-react";

type UserForm = { name: string; email: string; role: string; password: string; };
const emptyForm: UserForm = { name: "", email: "", role: "sales", password: "" };
const ROLES = ["ceo", "developer", "manager", "sales", "accountant", "warehouse", "purchase"];
const roleColor = (r: string) => r === "ceo" ? "bg-primary/20 text-red-400 border-0" : r === "developer" ? "bg-blue-500/10 text-blue-400 border-0" : "bg-muted text-muted-foreground border-0";

export default function Users() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);

  const { data, isLoading } = useGetUsers();
  const create = useCreateUser();
  const update = useUpdateUser();
  const del = useDeleteUser();

  const invalidate = () => qc.invalidateQueries({ queryKey: getGetUsersQueryKey() });
  const openNew = () => { setForm(emptyForm); setEditing(null); setOpen(true); };
  const openEdit = (u: NonNullable<typeof data>[0]) => {
    setForm({ name: u.name, email: u.email, role: u.role, password: "" });
    setEditing(u.id); setOpen(true);
  };
  const handleSave = async () => {
    if (editing) {
      await update.mutateAsync({ id: editing, data: { name: form.name, role: form.role as "ceo" | "developer" | "manager" | "sales" | "accountant" | "warehouse" | "purchase" } });
    } else {
      await create.mutateAsync({ data: { name: form.name, email: form.email, role: form.role as "ceo" | "developer" | "manager" | "sales" | "accountant" | "warehouse" | "purchase", password: form.password } });
    }
    invalidate(); setOpen(false);
  };
  const handleDelete = async (id: number) => {
    if (!confirm("Delete this user?")) return;
    await del.mutateAsync({ id }); invalidate();
  };
  const handleToggleActive = async (id: number, isActive: boolean) => {
    await update.mutateAsync({ id, data: { isActive: !isActive } }); invalidate();
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Users2 className="w-6 h-6 text-primary" /> User Management</h1>
            <p className="text-muted-foreground text-sm mt-1">{data?.length || 0} users</p>
          </div>
          <Button onClick={openNew} className="bg-primary hover:bg-primary/90 gap-2"><Plus className="w-4 h-4" /> Add User</Button>
        </div>

        <Card className="border-border bg-card">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground uppercase text-xs tracking-wider">
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-center">Role</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-left">Joined</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Loading...</td></tr>
                    : data?.length === 0 ? <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No users found</td></tr>
                    : data?.map(u => (
                      <tr key={u.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                        <td className="px-4 py-3 font-medium">{u.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                        <td className="px-4 py-3 text-center"><Badge className={roleColor(u.role)}>{u.role}</Badge></td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => handleToggleActive(u.id, u.isActive)} className="cursor-pointer">
                            <Badge className={u.isActive ? "bg-green-500/10 text-green-400 border-0" : "bg-muted text-muted-foreground border-0"}>
                              {u.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </button>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex gap-2 justify-center">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(u)} className="hover:bg-accent w-8 h-8 p-0"><Edit className="w-4 h-4" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDelete(u.id)} className="hover:bg-destructive/20 hover:text-destructive w-8 h-8 p-0"><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit User" : "Add User"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="bg-background/50 border-border" />
            </div>
            {!editing && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Email *</Label>
                  <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="bg-background/50 border-border" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Password *</Label>
                  <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="bg-background/50 border-border" />
                </div>
              </>
            )}
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Role</Label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                <SelectTrigger className="bg-background/50 border-border capitalize"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} className="border-border">Cancel</Button>
            <Button onClick={handleSave} disabled={!form.name || create.isPending || update.isPending} className="bg-primary hover:bg-primary/90">{editing ? "Save" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
