import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useGetSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier, getGetSuppliersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2, UserSquare, ChevronRight, Wallet } from "lucide-react";
import Confirm from "@/components/ui/confirm";
import { Link } from "wouter";
import { SmartImportButton } from "@/components/smart-import-button";

type SuppForm = { name: string; phone: string; email: string; address: string; city: string; };
const emptyForm: SuppForm = { name: "", phone: "", email: "", address: "", city: "" };

export default function Suppliers() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<SuppForm>(emptyForm);

  const { data, isLoading } = useGetSuppliers({ search: search || undefined });
  const create = useCreateSupplier();
  const update = useUpdateSupplier();
  const del = useDeleteSupplier();

  const invalidate = () => qc.invalidateQueries({ queryKey: getGetSuppliersQueryKey() });
  const openNew = () => { setForm(emptyForm); setEditing(null); setOpen(true); };
  const openEdit = (s: NonNullable<typeof data>[0]) => {
    setForm({ name: s.name, phone: s.phone, email: s.email || "", address: s.address || "", city: s.city || "" });
    setEditing(s.id); setOpen(true);
  };
  const handleSave = async () => {
    const payload = { name: form.name, phone: form.phone, email: form.email || undefined, address: form.address || undefined, city: form.city || undefined };
    if (editing) { await update.mutateAsync({ id: editing, data: payload }); }
    else { await create.mutateAsync({ data: payload }); }
    invalidate(); setOpen(false);
  };
  const handleDelete = async (id: number) => {
    if (!confirm("Delete this supplier?")) return;
    await del.mutateAsync({ id }); invalidate();
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><UserSquare className="w-6 h-6 text-primary" /> Suppliers</h1>
            <p className="text-muted-foreground text-sm mt-1">{data?.length || 0} suppliers</p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <SmartImportButton />
            <Button onClick={openNew} className="bg-primary hover:bg-primary/90 gap-2 w-full sm:w-auto"><Plus className="w-4 h-4" /> Add Supplier</Button>
          </div>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search suppliers..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-card border-border" />
        </div>

        <Card className="border-border bg-card">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground uppercase text-xs tracking-wider">
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Phone</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-left">City</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">Loading...</td></tr>
                    : data?.length === 0 ? <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">No suppliers found</td></tr>
                    : data?.map(s => (
                      <tr key={s.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                        <td className="px-4 py-3 font-medium">
                          <Link href={`/suppliers/${s.id}`} className="hover:text-primary hover:underline">{s.name}</Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{s.phone}</td>
                        <td className="px-4 py-3 text-muted-foreground">{s.email || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{s.city || "—"}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex gap-2 justify-center">
                            <Link href={`/suppliers/${s.id}?tab=ledger`}>
                              <Button size="sm" variant="ghost" className="hover:bg-primary/10 hover:text-primary w-full sm:w-8 h-8 p-0" title="Khata (Ledger)"><Wallet className="w-4 h-4" /></Button>
                            </Link>
                            <Link href={`/suppliers/${s.id}`}>
                              <Button size="sm" variant="ghost" className="hover:bg-accent w-full sm:w-8 h-8 p-0"><ChevronRight className="w-4 h-4" /></Button>
                            </Link>
                            <Button size="sm" variant="ghost" onClick={() => openEdit(s)} className="hover:bg-accent w-full sm:w-8 h-8 p-0"><Edit className="w-4 h-4" /></Button>
                            <Confirm title="Delete this supplier?" description="This action cannot be undone." onConfirm={() => handleDelete(s.id)} trigger={<Button size="sm" variant="ghost" className="hover:bg-destructive/20 hover:text-destructive w-full sm:w-8 h-8 p-0"><Trash2 className="w-4 h-4" /></Button>} />
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
          <DialogHeader><DialogTitle>{editing ? "Edit Supplier" : "Add Supplier"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            {(["name", "phone", "email", "address", "city"] as const).map(field => (
              <div key={field} className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">{field}{field === "name" || field === "phone" ? " *" : ""}</Label>
                <Input value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} className="bg-background/50 border-border" />
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} className="border-border">Cancel</Button>
            <Button onClick={handleSave} disabled={!form.name || !form.phone || create.isPending || update.isPending} className="bg-primary hover:bg-primary/90">{editing ? "Save" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
