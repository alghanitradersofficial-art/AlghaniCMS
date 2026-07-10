import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGetProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, useGetCategories, useGetBrands, useGetInventoryReport, getGetProductsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2, AlertTriangle, Package } from "lucide-react";

type ProductForm = {
  name: string; sku: string; description: string; categoryId: string; brandId: string;
  costPrice: string; salePrice: string; currentStock: string; minStock: string; unit: string; oemNumber: string;
};

const emptyForm: ProductForm = {
  name: "", sku: "", description: "", categoryId: "", brandId: "",
  costPrice: "", salePrice: "", currentStock: "0", minStock: "5", unit: "pcs", oemNumber: "",
};

export default function Inventory() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);

  const { data, isLoading } = useGetProducts({
    search: search || undefined,
    categoryId: categoryFilter ? parseInt(categoryFilter) : undefined,
    lowStock: lowStockOnly || undefined,
    page,
    limit: 20,
  });
  const { data: categories } = useGetCategories();
  const { data: brands } = useGetBrands();
  const { data: inventoryReport } = useGetInventoryReport();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const invalidate = () => qc.invalidateQueries({ queryKey: getGetProductsQueryKey() });

  const openNew = () => { setForm(emptyForm); setEditing(null); setOpen(true); };
  const openEdit = (p: NonNullable<typeof data>["data"][0]) => {
    setForm({
      name: p.name, sku: p.sku, description: p.description || "", categoryId: p.categoryId ? String(p.categoryId) : "",
      brandId: p.brandId ? String(p.brandId) : "", costPrice: String(p.costPrice), salePrice: String(p.salePrice),
      currentStock: String(p.currentStock), minStock: String(p.minStock), unit: p.unit, oemNumber: p.oemNumber || "",
    });
    setEditing(p.id);
    setOpen(true);
  };

  const handleSave = async () => {
    const payload = {
      name: form.name, sku: form.sku, description: form.description || undefined,
      categoryId: form.categoryId ? parseInt(form.categoryId) : null,
      brandId: form.brandId ? parseInt(form.brandId) : null,
      costPrice: parseFloat(form.costPrice), salePrice: parseFloat(form.salePrice),
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
    if (!confirm("Delete this product?")) return;
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
          <Button onClick={openNew} className="bg-primary hover:bg-primary/90 gap-2"><Plus className="w-4 h-4" /> Add Product</Button>
        </div>

        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search products..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9 bg-card border-border" />
          </div>
          <Select value={categoryFilter} onValueChange={v => { setCategoryFilter(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-48 bg-card border-border"><SelectValue placeholder="All Categories" /></SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">All Categories</SelectItem>
              {categories?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
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
              <p className="text-xl font-bold mt-1 text-destructive">{inventoryReport?.categories?.filter(c => c.count <= 0).length || 0}</p>
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
                    <th className="px-4 py-3 text-left">SKU</th>
                    <th className="px-4 py-3 text-left">Category</th>
                    <th className="px-4 py-3 text-left">Brand</th>
                    <th className="px-4 py-3 text-right">Cost</th>
                    <th className="px-4 py-3 text-right">Sale Price</th>
                    <th className="px-4 py-3 text-center">Stock</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">Loading...</td></tr>
                  ) : data?.data.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">No products found</td></tr>
                  ) : data?.data.map(p => (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{p.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.sku}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.categoryName || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.brandName || "—"}</td>
                      <td className="px-4 py-3 text-right">Rs. {p.costPrice?.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-secondary font-medium">Rs. {p.salePrice?.toLocaleString()}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={p.currentStock <= p.minStock ? "destructive" : "secondary"} className={p.currentStock <= p.minStock ? "bg-destructive/20 text-red-400 border-0" : "bg-green-500/10 text-green-400 border-0"}>
                          {p.currentStock} {p.unit}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex gap-2 justify-center">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(p)} className="hover:bg-accent w-8 h-8 p-0"><Edit className="w-4 h-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id)} className="hover:bg-destructive/20 hover:text-destructive w-8 h-8 p-0"><Trash2 className="w-4 h-4" /></Button>
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
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">SKU *</Label>
                <Input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} className="bg-background/50 border-border" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Category</Label>
                <Select value={form.categoryId} onValueChange={v => setForm(f => ({ ...f, categoryId: v }))}>
                  <SelectTrigger className="bg-background/50 border-border"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {categories?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Brand</Label>
                <Select value={form.brandId} onValueChange={v => setForm(f => ({ ...f, brandId: v }))}>
                  <SelectTrigger className="bg-background/50 border-border"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {brands?.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Cost Price (Rs.)</Label>
                <Input type="number" value={form.costPrice} onChange={e => setForm(f => ({ ...f, costPrice: e.target.value }))} className="bg-background/50 border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Sale Price (Rs.)</Label>
                <Input type="number" value={form.salePrice} onChange={e => setForm(f => ({ ...f, salePrice: e.target.value }))} className="bg-background/50 border-border" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Stock</Label>
                <Input type="number" value={form.currentStock} onChange={e => setForm(f => ({ ...f, currentStock: e.target.value }))} className="bg-background/50 border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Min Stock</Label>
                <Input type="number" value={form.minStock} onChange={e => setForm(f => ({ ...f, minStock: e.target.value }))} className="bg-background/50 border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Unit</Label>
                <Input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} className="bg-background/50 border-border" />
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
