import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useGetExpenses, useCreateExpense, useUpdateExpense, useDeleteExpense, getGetExpensesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2, Receipt } from "lucide-react";
import Confirm from "@/components/ui/confirm";

type ExpForm = { title: string; category: string; amount: string; date: string; notes: string; };
const emptyForm: ExpForm = { title: "", category: "", amount: "", date: new Date().toISOString().split("T")[0], notes: "" };

const EXPENSE_CATEGORIES = ["Rent", "Utilities", "Transport", "Marketing", "Operations", "Maintenance", "Miscellaneous"];

export default function Expenses() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<ExpForm>(emptyForm);

  const { data, isLoading } = useGetExpenses({ page, limit: 20 });
  const create = useCreateExpense();
  const update = useUpdateExpense();
  const del = useDeleteExpense();

  const invalidate = () => qc.invalidateQueries({ queryKey: getGetExpensesQueryKey() });
  const openNew = () => { setForm(emptyForm); setEditing(null); setOpen(true); };
  const openEdit = (e: NonNullable<typeof data>["data"][0]) => {
    setForm({ title: e.title, category: e.category, amount: String(e.amount), date: e.date, notes: e.notes || "" });
    setEditing(e.id); setOpen(true);
  };
  const handleSave = async () => {
    const payload = { title: form.title, category: form.category, amount: parseFloat(form.amount), date: form.date, notes: form.notes || undefined };
    if (editing) { await update.mutateAsync({ id: editing, data: payload }); }
    else { await create.mutateAsync({ data: payload }); }
    invalidate(); setOpen(false);
  };
  const handleDelete = async (id: number) => {
    if (!confirm("Delete this expense?")) return;
    await del.mutateAsync({ id }); invalidate();
  };

  const totalExpenses = data?.data.reduce((s, e) => s + e.amount, 0) || 0;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Receipt className="w-6 h-6 text-primary" /> Expenses</h1>
            <p className="text-muted-foreground text-sm mt-1">Total on page: Rs. {totalExpenses.toLocaleString()}</p>
          </div>
          <Button onClick={openNew} className="bg-primary hover:bg-primary/90 gap-2 w-full sm:w-auto"><Plus className="w-4 h-4" /> Add Expense</Button>
        </div>

        <Card className="border-border bg-card">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground uppercase text-xs tracking-wider">
                    <th className="px-4 py-3 text-left">Title</th>
                    <th className="px-4 py-3 text-left">Category</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Notes</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Loading...</td></tr>
                    : data?.data.length === 0 ? <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No expenses found</td></tr>
                    : data?.data.map(e => (
                      <tr key={e.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                        <td className="px-4 py-3 font-medium">{e.title}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 rounded text-xs bg-accent text-muted-foreground">{e.category}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-primary">Rs. {e.amount?.toLocaleString()}</td>
                        <td className="px-4 py-3 text-muted-foreground">{e.date}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs max-w-[200px] truncate">{e.notes || "—"}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex flex-col sm:flex-row gap-2 justify-center">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(e)} className="hover:bg-accent w-full sm:w-8 h-8 p-0"><Edit className="w-4 h-4" /></Button>
                            <Confirm title="Delete this expense?" description="This action cannot be undone." onConfirm={() => handleDelete(e.id)} trigger={<Button size="sm" variant="ghost" className="hover:bg-destructive/20 hover:text-destructive w-full sm:w-8 h-8 p-0"><Trash2 className="w-4 h-4" /></Button>} />
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {data && data.total > 20 && (
              <div className="flex justify-center gap-2 p-4 border-t border-border">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="border-border">Prev</Button>
                <span className="flex items-center px-3 text-sm text-muted-foreground">Page {page} of {Math.ceil(data.total / 20)}</span>
                <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(data.total / 20)} className="border-border">Next</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Expense" : "Add Expense"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Title *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="bg-background/50 border-border" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Category *</Label>
              <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="bg-background/50 border-border" list="exp-categories" />
              <datalist id="exp-categories">{EXPENSE_CATEGORIES.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Amount (Rs.) *</Label>
                <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="bg-background/50 border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Date *</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="bg-background/50 border-border" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="bg-background/50 border-border" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} className="border-border">Cancel</Button>
            <Button onClick={handleSave} disabled={!form.title || !form.amount || create.isPending || update.isPending} className="bg-primary hover:bg-primary/90">{editing ? "Save" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
