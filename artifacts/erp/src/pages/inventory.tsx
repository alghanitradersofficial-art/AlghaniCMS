import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGetProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, useGetBrands, useGetInventoryReport, useGetLowStockAlerts, getGetProductsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2, AlertTriangle, Package } from "lucide-react";
import Confirm from "@/components/ui/confirm";
import { AiExcelImportButton } from "@/components/ai-excel-import-button";

type ProductForm = {
  name: string; sku: string; description: string; brandId: string;
  costPrice: string; currentStock: string; minStock: string; unit: string; oemNumber: string; createdAt?: string;
};

const emptyForm: ProductForm = {
  name: "", sku: "", description: "", brandId: "",
  costPrice: "", currentStock: "0", minStock: "5", unit: "pcs", oemNumber: "", createdAt: new Date().toISOString().split('T')[0],
};

export default function Inventory() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);

  const { data, isLoading } = useGetProducts({
    search: search || undefined,
    lowStock: lowStockOnly || undefined,
    page,
    limit: 20,
  });

  const { data: brands } = useGetBrands();
  const { data: inventoryReport } = useGetInventoryReport();
  const { data: lowStockAlerts } = useGetLowStockAlerts();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const invalidate = () => qc.invalidateQueries({ queryKey: getGetProductsQueryKey() });

  const openNew = () => { setForm(emptyForm); setEditing(null); setOpen(true); };
  const openEdit = (p: NonNullable<typeof data>["data"][0]) => {
    setForm({
      name: p.name, sku: p.sku, description: p.description || "",
      brandId: p.brandId ? String(p.brandId) : "", costPrice: String(p.costPrice),
      currentStock: String(p.currentStock), minStock: String(p.minStock), unit: p.unit, oemNumber: p.oemNumber || "", createdAt: new Date().toISOString().split('T')[0],
    });
    setEditing(p.id);
    setOpen(true);
  };

  const handleSave = async () => {
    const payload = {
      name: form.name, sku: form.sku.trim() || undefined, description: form.description || undefined,
      brandId: form.brandId ? parseInt(form.brandId) : null,
      costPrice: parseFloat(form.costPrice),
      currentStock: parseInt(form.currentStock), minStock: parseInt(form.minStock),
      unit: form.unit, oemNumber: form.oemNumber || undefined,
    };
    if (editing) {
      await updateProduct.mutateAsync({ id: editing, data: payload });
    } else {
      await createProduct.mutateAsync({ data: payload });
    }
    invalidate();
    setOpen(false);
  };

  const handleDelete = async (id: number) => {
    await deleteProduct.mutateAsync({ id });
    invalidate();
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Package className="w-6 h-6 text-primary" /> Inventory</h1>
            <p className="text-muted-foreground text-sm mt-1">{data?.total || 0} products total</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <AiExcelImportButton importType="products" onComplete={invalidate} />
            <Button onClick={openNew} className="bg-primary hover:bg-primary/90 gap-2 w-full sm:w-auto"><Plus className="w-4 h-4" /> Add Product</Button>
          </div>
        </div>

        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search products..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9 bg-card border-border" />
          </div>
          <Button variant={lowStockOnly ? "default" : "outline"} onClick={() => setLowStockOnly(!lowStockOnly)} className={lowStockOnly ? "bg-primary" : "border-border"}>
            <AlertTriangle className="w-4 h-4 mr-2" /> Low Stock
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Stock Units</p>
              <p className="text-xl font-bold mt-1">{inventoryReport?.totalStock?.toLocaleString() || "0"}</p>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Inventory Value</p>
              <p className="text-xl font-bold mt-1 text-secondary">Rs. {inventoryReport?.totalValue?.toLocaleString() || "0"}</p>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Low Stock Alerts</p>
              <p className="text-xl font-bold mt-1 text-destructive">{lowStockAlerts?.length ?? 0}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border bg-card">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground uppercase text-xs tracking-wider">
                    <th className="px-4 py-3 text-left">Product</th>
                    <th className="px-4 py-3 text-left">Product ID</th>
                    <th className="px-4 py-3 text-left">Brand</th>
                    <th className="px-4 py-3 text-right">Cost</th>
                    <th className="px-4 py-3 text-center">Stock</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Loading...</td></tr>
                  ) : data?.data.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No products found</td></tr>
                  ) : data?.data.map(p => (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{p.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{p.id}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.brandName || "—"}</td>
                      <td className="px-4 py-3 text-right">Rs. {p.costPrice?.toLocaleString()}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={p.currentStock <= p.minStock ? "destructive" : "secondary"} className={p.currentStock <= p.minStock ? "bg-destructive/20 text-red-400 border-0" : "bg-green-500/10 text-green-400 border-0"}>
                          {p.currentStock} {p.unit}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex gap-2 justify-center">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(p)} className="hover:bg-accent w-8 h-8 p-0"><Edit className="w-4 h-4" /></Button>
                          <Confirm
                            title="Delete this product?"
                            description="This action cannot be undone."
                            onConfirm={() => handleDelete(p.id)}
                            trigger={<Button size="sm" variant="ghost" className="hover:bg-destructive/20 hover:text-destructive w-8 h-8 p-0"><Trash2 className="w-4 h-4" /></Button>}
                          />
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
        <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Name *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="bg-background/50 border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Product ID</Label>
                <Input
                  value={editing ? `#${editing}` : "Auto-generated on save"}
                  disabled
                  className="bg-background/30 border-border text-muted-foreground"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Brand</Label>
                <Select value={form.brandId} onValueChange={v => setForm(f => ({ ...f, brandId: v }))}>
                  <SelectTrigger className="bg-background/50 border-border"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {brands?.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Date</Label>
                <Input type="date" value={form.createdAt} onChange={e => setForm(f => ({ ...f, createdAt: e.target.value }))} className="bg-background/50 border-border" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Cost Price (Rs.)</Label>
                <Input type="number" value={form.costPrice} onChange={e => setForm(f => ({ ...f, costPrice: e.target.value }))} className="bg-background/50 border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Stock</Label>
                <Input type="number" value={form.currentStock} onChange={e => setForm(f => ({ ...f, currentStock: e.target.value }))} className="bg-background/50 border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Min Stock</Label>
                <Input type="number" value={form.minStock} onChange={e => setForm(f => ({ ...f, minStock: e.target.value }))} className="bg-background/50 border-border" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Unit</Label>
                <Input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} className="bg-background/50 border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">SKU (auto-suggested, editable)</Label>
                <Input
                  value={form.sku}
                  placeholder="Leave blank to auto-generate"
                  onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                  className="bg-background/50 border-border"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">OEM Number</Label>
              <Input value={form.oemNumber} onChange={e => setForm(f => ({ ...f, oemNumber: e.target.value }))} className="bg-background/50 border-border" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} className="border-border">Cancel</Button>
            <Button onClick={handleSave} disabled={createProduct.isPending || updateProduct.isPending} className="bg-primary hover:bg-primary/90">
              {editing ? "Save Changes" : "Add Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
