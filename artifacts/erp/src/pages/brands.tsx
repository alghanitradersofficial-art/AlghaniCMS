import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useGetBrands, useCreateBrand, useUpdateBrand, useDeleteBrand, getGetBrandsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2, Briefcase } from "lucide-react";

export default function Brands() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data, isLoading } = useGetBrands();
  const create = useCreateBrand();
  const update = useUpdateBrand();
  const del = useDeleteBrand();

  const invalidate = () => qc.invalidateQueries({ queryKey: getGetBrandsQueryKey() });
  const openNew = () => { setName(""); setDescription(""); setEditing(null); setOpen(true); };
  const openEdit = (b: NonNullable<typeof data>[0]) => { setName(b.name); setDescription(b.description || ""); setEditing(b.id); setOpen(true); };
  const handleSave = async () => {
    if (editing) { await update.mutateAsync({ id: editing, data: { name, description: description || undefined } }); }
    else { await create.mutateAsync({ data: { name, description: description || undefined } }); }
    invalidate(); setOpen(false);
  };
  const handleDelete = async (id: number) => {
    if (!confirm("Delete this brand?")) return;
    await del.mutateAsync({ id }); invalidate();
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Briefcase className="w-6 h-6 text-primary" /> Brands</h1>
            <p className="text-muted-foreground text-sm mt-1">{data?.length || 0} brands</p>
          </div>
          <Button onClick={openNew} className="bg-primary hover:bg-primary/90 gap-2"><Plus className="w-4 h-4" /> Add Brand</Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading ? <p className="text-muted-foreground">Loading...</p> :
            data?.map(brand => (
              <Card key={brand.id} className="border-border bg-card hover:border-primary/30 transition-colors">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">{brand.name}</h3>
                      {brand.description && <p className="text-muted-foreground text-sm mt-1">{brand.description}</p>}
                      <p className="text-secondary text-sm mt-3 font-medium">{brand.productCount} products</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(brand)} className="hover:bg-accent w-8 h-8 p-0"><Edit className="w-4 h-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(brand.id)} className="hover:bg-destructive/20 hover:text-destructive w-8 h-8 p-0"><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>{editing ? "Edit Brand" : "Add Brand"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} className="bg-background/50 border-border" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Description</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} className="bg-background/50 border-border" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} className="border-border">Cancel</Button>
            <Button onClick={handleSave} disabled={!name || create.isPending || update.isPending} className="bg-primary hover:bg-primary/90">{editing ? "Save" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
