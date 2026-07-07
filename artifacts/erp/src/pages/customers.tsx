import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGetCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer, getGetCustomersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2, Users } from "lucide-react";

type CustForm = { name: string; phone: string; email: string; address: string; city: string; type: string; };
const emptyForm: CustForm = { name: "", phone: "", email: "", address: "", city: "", type: "retail" };

export default function Customers() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<CustForm>(emptyForm);

  const { data, isLoading } = useGetCustomers({ search: search || undefined, page, limit: 20 });
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const del = useDeleteCustomer();

  const invalidate = () => qc.invalidateQueries({ queryKey: getGetCustomersQueryKey() });
  const openNew = () => { setForm(emptyForm); setEditing(null); setOpen(true); };
  const openEdit = (c: NonNullable<typeof data>["data"][0]) => {
    setForm({
      name: c.name,
      phone: c.phone,
      email: c.email || "",
      address: c.address || "",
      city: c.city || "",
      type: c.type || "retail",
    });
    setEditing(c.id); setOpen(true);
  };
  const handleSave = async () => {
    const payload = { name: form.name, phone: form.phone, email: form.email || undefined, address: form.address || undefined, city: form.city || undefined, type: form.type as "retail" | "dealer" | "wholesale" };
    if (editing) { await update.mutateAsync({ id: editing, data: payload }); }
    else { await create.mutateAsync({ data: payload }); }
    invalidate(); setOpen(false);
  };
  const handleDelete = async (id: number) => {
    if (!confirm("Delete this customer?")) return;
    await del.mutateAsync({ id }); invalidate();
  };
  const typeColor = (t: string) => t === "dealer" ? "bg-primary/10 text-red-400 border-0" : t === "wholesale" ? "bg-secondary/10 text-yellow-400 border-0" : "bg-muted text-muted-foreground border-0";

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Users className="w-6 h-6 text-primary" /> Customers</h1>
            <p className="text-muted-foreground text-sm mt-1">{data?.total || 0} customers</p>
          </div>
          <Button onClick={openNew} className="bg-primary hover:bg-primary/90 gap-2"><Plus className="w-4 h-4" /> Add Customer</Button>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search customers..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9 bg-card border-border" />
        </div>

        <Card className="border-border bg-card">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground uppercase text-xs tracking-wider">
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Phone</th>
                    <th className="px-4 py-3 text-left">City</th>
                    <th className="px-4 py-3 text-center">Type</th>
                    <th className="px-4 py-3 text-right">Orders</th>
                    <th className="px-4 py-3 text-right">Total Spent</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">Loading...</td></tr>
                    : data?.data.length === 0 ? <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">No customers found</td></tr>
                    : data?.data.map(c => (
                      <tr key={c.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                        <td className="px-4 py-3 font-medium">{c.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{c.phone}</td>
                        <td className="px-4 py-3 text-muted-foreground">{c.city || "—"}</td>
                        <td className="px-4 py-3 text-center"><Badge className={typeColor(c.type ?? "retail")}>{c.type || "retail"}</Badge></td>
                        <td className="px-4 py-3 text-right">{c.totalOrders}</td>
                        <td className="px-4 py-3 text-right text-secondary font-medium">Rs. {c.totalSpent?.toLocaleString()}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex gap-2 justify-center">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(c)} className="hover:bg-accent w-8 h-8 p-0"><Edit className="w-4 h-4" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDelete(c.id)} className="hover:bg-destructive/20 hover:text-destructive w-8 h-8 p-0"><Trash2 className="w-4 h-4" /></Button>
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
          <DialogHeader><DialogTitle>{editing ? "Edit Customer" : "Add Customer"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            {(["name", "phone", "email", "address", "city"] as const).map(field => (
              <div key={field} className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">{field}{field === "name" || field === "phone" ? " *" : ""}</Label>
                <Input value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} className="bg-background/50 border-border" />
              </div>
            ))}
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Type</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger className="bg-background/50 border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="retail">Retail</SelectItem>
                  <SelectItem value="dealer">Dealer</SelectItem>
                  <SelectItem value="wholesale">Wholesale</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
