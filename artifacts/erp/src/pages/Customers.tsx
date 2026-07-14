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
import Confirm from "@/components/ui/confirm";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2, Users, Wallet } from "lucide-react";
import { CustomerLedgerDialog } from "@/components/customer-ledger-dialog";
import DataTable from "@/components/ui/data-table";

type CustForm = { name: string; phone: string; email: string; address: string; city: string; type: string; };
const emptyForm: CustForm = { name: "", phone: "", email: "", address: "", city: "", type: "retail" };

export default function Customers() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<CustForm>(emptyForm);
  const [ledgerCustomer, setLedgerCustomer] = useState<{ id: number; name: string } | null>(null);

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
          <Button onClick={openNew} className="bg-primary hover:bg-primary/90 gap-2 w-full sm:w-auto"><Plus className="w-4 h-4" /> Add Customer</Button>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search customers..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9 bg-card border-border" />
        </div>

        <Card className="border-border bg-card">
          <CardContent className="p-0">
            <DataTable
              loading={isLoading}
              data={data?.data || []}
              columns={[
                { key: 'name', title: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
                { key: 'phone', title: 'Phone', render: (r) => <span className="text-muted-foreground">{r.phone}</span> },
                { key: 'city', title: 'City', render: (r) => r.city || '—' },
                { key: 'type', title: 'Type', align: 'center', render: (r) => <Badge className={typeColor(r.type ?? 'retail')}>{r.type || 'retail'}</Badge> },
                { key: 'orders', title: 'Orders', align: 'right', render: (r) => r.totalOrders },
                { key: 'totalSpent', title: 'Total Spent', align: 'right', render: (r) => <span className="text-secondary font-medium">Rs. {Number(r.totalSpent || 0).toLocaleString()}</span> },
                { key: 'actions', title: 'Actions', align: 'center', render: (r) => (
                  <div className="flex gap-2 justify-center">
                    <Button size="sm" variant="ghost" onClick={() => setLedgerCustomer({ id: r.id, name: r.name })} className="hover:bg-primary/10 hover:text-primary w-8 h-8 p-0" title="Khata (Ledger)"><Wallet className="w-4 h-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(r)} className="hover:bg-accent w-8 h-8 p-0"><Edit className="w-4 h-4" /></Button>
                    <Confirm
                      title="Delete this customer?"
                      description="This action cannot be undone."
                      onConfirm={() => handleDelete(r.id)}
                      trigger={<Button size="sm" variant="ghost" className="hover:bg-destructive/20 hover:text-destructive w-8 h-8 p-0"><Trash2 className="w-4 h-4" /></Button>}
                    />
                  </div>
                ) },
              ]}
            />
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

      <CustomerLedgerDialog
        customerId={ledgerCustomer?.id ?? null}
        customerName={ledgerCustomer?.name ?? ""}
        open={!!ledgerCustomer}
        onOpenChange={(o) => { if (!o) setLedgerCustomer(null); }}
      />
    </Layout>
  );
}
