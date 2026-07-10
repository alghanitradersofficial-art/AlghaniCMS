import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGetUsers, useCreateUser, useUpdateUser, useDeleteUser, getGetUsersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2, Users2, Key, ShieldCheck } from "lucide-react";
import { getUser } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

const ALL_MODULES = [
  { id: "dashboard", label: "Dashboard" },
  { id: "inventory", label: "Inventory" },
  { id: "brands", label: "Brands" },
  { id: "sales", label: "Sales" },
  { id: "purchases", label: "Purchase" },
  { id: "customers", label: "Customers" },
  { id: "suppliers", label: "Suppliers" },
  { id: "expenses", label: "Expenses" },
  { id: "staff", label: "Staff" },
  { id: "ledger", label: "Ledger" },
  { id: "reports", label: "Reports & Analytics" },
  { id: "users", label: "Users" },
  { id: "settings", label: "Settings" },
];

type UserForm = { name: string; email: string; role: string; password: string; permissions: string[]; };
const emptyForm: UserForm = { name: "", email: "", role: "sales", password: "", permissions: [] };
const ROLES = ["ceo", "developer", "manager", "sales", "accountant", "warehouse", "content"];
const roleColor = (r: string) =>
  r === "ceo" ? "bg-primary/20 text-red-400 border-0" :
  r === "developer" ? "bg-blue-500/10 text-blue-400 border-0" :
  "bg-muted text-muted-foreground border-0";

const isAdminRole = (role: string) => role === "ceo" || role === "developer";

export default function Users() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const currentUser = getUser();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const { data, isLoading, error, isError } = useGetUsers();
  const create = useCreateUser();
  const update = useUpdateUser();
  const del = useDeleteUser();

  const invalidate = () => qc.invalidateQueries({ queryKey: getGetUsersQueryKey() });

  const openNew = () => { setForm(emptyForm); setEditing(null); setOpen(true); };
  const openEdit = (u: NonNullable<typeof data>[0]) => {
    setForm({ name: u.name, email: u.email, role: u.role, password: "", permissions: u.permissions || [] });
    setEditing(u.id); setOpen(true);
  };

  const togglePermission = (mod: string) => {
    setForm(f => ({
      ...f,
      permissions: f.permissions.includes(mod)
        ? f.permissions.filter(p => p !== mod)
        : [...f.permissions, mod]
    }));
  };

  const handleSave = async () => {
    const perms = isAdminRole(form.role) ? ALL_MODULES.map(m => m.id) : form.permissions;
    try {
      if (editing) {
        await update.mutateAsync({
          id: editing,
          data: {
            name: form.name,
            role: form.role as "ceo" | "developer" | "manager" | "sales" | "accountant" | "warehouse" | "content",
            permissions: perms,
          },
        });
        toast({ title: "User updated", description: "The user has been updated successfully." });
      } else {
        await create.mutateAsync({
          data: {
            name: form.name,
            email: form.email,
            role: form.role as "ceo" | "developer" | "manager" | "sales" | "accountant" | "warehouse" | "content",
            password: form.password,
            permissions: perms,
          },
        });
        toast({ title: "User added", description: "The new user has been created successfully." });
      }
      invalidate();
      setOpen(false);
    } catch (error) {
      toast({ title: "Failed to save user", description: (error as Error).message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this user?")) return;
    try {
      await del.mutateAsync({ id });
      toast({ title: "User deleted", description: "The user has been removed." });
      invalidate();
    } catch (error) {
      toast({ title: "Failed to delete user", description: (error as Error).message, variant: "destructive" });
    }
  };

  const handleToggleActive = async (id: number, isActive: boolean) => {
    try {
      await update.mutateAsync({ id, data: { isActive: !isActive } });
      toast({ title: "User status updated" });
      invalidate();
    } catch (error) {
      toast({ title: "Failed to update user status", description: (error as Error).message, variant: "destructive" });
    }
  };

  const openReset = (id: number) => { setResetUserId(id); setNewPassword(""); setResetOpen(true); };
  const handleReset = async () => {
    if (!resetUserId || !newPassword) return;
    try {
      await update.mutateAsync({ id: resetUserId, data: { password: newPassword } as any });
      toast({ title: "Password reset", description: "User password has been updated." });
      invalidate();
      setResetOpen(false);
    } catch (error) {
      toast({ title: "Failed to reset password", description: (error as Error).message, variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
              <Users2 className="w-5 h-5 sm:w-6 sm:h-6 text-primary" /> User Management
            </h1>
            <p className="text-muted-foreground text-sm mt-1">{data?.length || 0} users</p>
          </div>
          <Button onClick={openNew} className="bg-primary hover:bg-primary/90 gap-2 h-11 sm:h-9">
            <Plus className="w-4 h-4" /> Add User
          </Button>
        </div>

        <Card className="border-border bg-card">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b border-border text-muted-foreground uppercase text-xs tracking-wider">
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-center">Role</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center">Permissions</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Loading...</td></tr>
                  ) : isError ? (
                    <tr><td colSpan={6} className="text-center py-12 text-destructive">Failed to load users: {(error as Error)?.message || "Unknown error"}</td></tr>
                  ) : data?.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No users found</td></tr>
                  ) : data?.map(u => (
                    <tr key={u.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{u.name}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{u.email}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={roleColor(u.role)}>{u.role}</Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleToggleActive(u.id, u.isActive ?? true)}
                          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${u.isActive ? "bg-green-500/10 text-green-400 hover:bg-red-500/10 hover:text-red-400" : "bg-red-500/10 text-red-400 hover:bg-green-500/10 hover:text-green-400"}`}
                        >
                          {u.isActive ? "Active" : "Disabled"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isAdminRole(u.role) ? (
                          <span className="text-xs text-emerald-400 flex items-center justify-center gap-1"><ShieldCheck className="w-3 h-3" /> Full Access</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{(u.permissions || []).length} modules</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(u)} className="h-8 w-8 p-0 hover:bg-accent">
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openReset(u.id)} className="h-8 w-8 p-0 hover:bg-accent" title="Reset Password">
                            <Key className="w-3.5 h-3.5" />
                          </Button>
                          {u.id !== currentUser?.id && (
                            <Button size="sm" variant="ghost" onClick={() => handleDelete(u.id)} className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
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

      {/* Add / Edit User Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit User" : "Add User"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="bg-background/50 border-border h-11" />
            </div>
            {!editing && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Email *</Label>
                  <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="bg-background/50 border-border h-11" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Password *</Label>
                  <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="bg-background/50 border-border h-11" />
                </div>
              </>
            )}
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Role</Label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                <SelectTrigger className="bg-background/50 border-border capitalize h-11"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Permissions — only shown for non-admin roles */}
            {!isAdminRole(form.role) && (
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Module Permissions
                </Label>
                <div className="grid grid-cols-2 gap-2 p-3 rounded-md border border-border bg-background/30">
                  {ALL_MODULES.map(mod => (
                    <label key={mod.id} className="flex items-center gap-2 cursor-pointer hover:text-foreground transition-colors text-sm">
                      <Checkbox
                        checked={form.permissions.includes(mod.id)}
                        onCheckedChange={() => togglePermission(mod.id)}
                        className="border-border"
                      />
                      <span className="text-sm text-muted-foreground">{mod.label}</span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="text-xs h-7 border-border" onClick={() => setForm(f => ({ ...f, permissions: ALL_MODULES.map(m => m.id) }))}>
                    Select All
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs h-7 border-border" onClick={() => setForm(f => ({ ...f, permissions: [] }))}>
                    Clear All
                  </Button>
                </div>
              </div>
            )}
            {isAdminRole(form.role) && (
              <div className="p-3 rounded-md border border-emerald-500/20 bg-emerald-500/5 text-xs text-emerald-400 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                This role has full access to all modules automatically.
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} className="border-border h-11 sm:h-9">Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={!form.name || (!editing && (!form.email || !form.password)) || create.isPending || update.isPending}
              className="bg-primary hover:bg-primary/90 h-11 sm:h-9"
            >
              {editing ? "Save" : "Add User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="bg-card border-border w-[95vw] max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Key className="w-4 h-4" /> Reset Password</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Enter a new password for this user.</p>
            <Input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="bg-background/50 border-border h-11"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setResetOpen(false)} className="border-border h-11 sm:h-9">Cancel</Button>
            <Button onClick={handleReset} disabled={!newPassword} className="bg-primary hover:bg-primary/90 h-11 sm:h-9">Reset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
