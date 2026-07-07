import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Users2, Plus, MoreVertical, Edit, Trash2, Shield, Eye, EyeOff, Key } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getUser } from "@/lib/auth";

const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

type User = {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  permissions: string[];
  phone?: string;
  cnic?: string;
  address?: string;
  photoUrl?: string;
  photoPublicId?: string;
  documents?: Array<{ url: string; name: string; type: string; publicId?: string }>;
  createdAt?: string;
};

const ROLES = ["ceo", "developer", "manager", "accountant", "sales", "warehouse", "purchase"];

const ALL_PERMISSIONS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "inventory", label: "View Inventory" },
  { key: "inventory:edit", label: "Edit Inventory" },
  { key: "sales", label: "View Sales" },
  { key: "sales:create", label: "Create Sales" },
  { key: "sales:delete", label: "Delete Sales" },
  { key: "purchases", label: "View Purchases" },
  { key: "purchases:create", label: "Create Purchases" },
  { key: "customers", label: "Customers" },
  { key: "suppliers", label: "Suppliers" },
  { key: "expenses", label: "View Expenses" },
  { key: "expenses:create", label: "Create Expenses" },
  { key: "reports", label: "Reports" },
  { key: "users", label: "Manage Users" },
  { key: "settings", label: "Settings" },
  { key: "export", label: "Export Data" },
  { key: "import", label: "Import Data" },
];

const ROLE_PRESETS: Record<string, string[]> = {
  ceo: ALL_PERMISSIONS.map(p => p.key),
  developer: ALL_PERMISSIONS.map(p => p.key),
  manager: ["dashboard", "inventory", "inventory:edit", "sales", "sales:create", "purchases", "purchases:create", "customers", "suppliers", "expenses", "reports", "export"],
  accountant: ["dashboard", "expenses", "expenses:create", "sales", "purchases", "reports", "export"],
  sales: ["dashboard", "sales", "sales:create", "customers", "inventory"],
  warehouse: ["dashboard", "inventory", "inventory:edit", "purchases", "suppliers"],
  purchase: ["dashboard", "purchases", "purchases:create", "suppliers", "inventory"],
};

const roleColors: Record<string, string> = {
  ceo: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  developer: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  manager: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  accountant: "bg-green-500/10 text-green-400 border-green-500/20",
  sales: "bg-primary/10 text-primary border-primary/20",
  warehouse: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  purchase: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
};

export default function Employees() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const currentUser = getUser();
  const isCeo = currentUser?.role === "ceo" || currentUser?.role === "developer";

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/users`);
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (!res.ok) {
        const message = (json && typeof json === "object" && "error" in json ? (json as { error?: string }).error : null) || res.statusText || "Failed to load users";
        throw new Error(message);
      }
      return Array.isArray(json) ? json : [];
    },
  });

  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "sales",
    password: "",
    phone: "",
    cnic: "",
    address: "",
    photoUrl: "",
    photoPublicId: "",
    documents: [] as Array<{ url: string; name: string; type: string; publicId?: string }>,
    permissions: [] as string[],
    isActive: true,
  });
  const [newPw, setNewPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pwUserId, setPwUserId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);

  const openAdd = () => {
    setEditing(null);
    setForm({
      name: "",
      email: "",
      role: "sales",
      password: "",
      phone: "",
      cnic: "",
      address: "",
      photoUrl: "",
      photoPublicId: "",
      documents: [],
      permissions: ROLE_PRESETS["sales"] || [],
      isActive: true,
    });
    setUploadError("");
    setOpen(true);
  };

  const openEdit = (u: User) => {
    setEditing(u);
    setForm({
      name: u.name,
      email: u.email,
      role: u.role,
      password: "",
      phone: u.phone || "",
      cnic: u.cnic || "",
      address: u.address || "",
      photoUrl: u.photoUrl || "",
      photoPublicId: u.photoPublicId || "",
      documents: u.documents || [],
      permissions: u.permissions || ROLE_PRESETS[u.role] || [],
      isActive: u.isActive,
    });
    setUploadError("");
    setOpen(true);
  };
  const openPw = (id: number) => { setPwUserId(id); setNewPw(""); setPwOpen(true); };

  const applyPreset = (role: string) => { setForm(f => ({ ...f, role, permissions: ROLE_PRESETS[role] || [] })); };
  const togglePerm = (key: string) => { setForm(f => ({ ...f, permissions: f.permissions.includes(key) ? f.permissions.filter(p => p !== key) : [...f.permissions, key] })); };

  const uploadToCloudinary = async (file: File, folder: string) => {
    setUploadError("");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);
    const res = await fetch(`${BASE}/api/upload/cloudinary`, { method: "POST", body: formData });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Upload failed");
    return json;
  };

  const handlePhotoUpload = async (file: File) => {
    try {
      setUploadingPhoto(true);
      const result = await uploadToCloudinary(file, "employees");
      setForm(f => ({ ...f, photoUrl: result.url, photoPublicId: result.publicId }));
    } catch (error: unknown) {
      setUploadError((error as Error).message || "Photo upload failed");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDocumentUpload = async (file: File) => {
    try {
      setUploadingDoc(true);
      const result = await uploadToCloudinary(file, "employees-documents");
      setForm(f => ({
        ...f,
        documents: [
          ...(f.documents || []),
          { url: result.url, name: file.name, type: file.type, publicId: result.publicId },
        ],
      }));
    } catch (error: unknown) {
      setUploadError((error as Error).message || "Document upload failed");
    } finally {
      setUploadingDoc(false);
    }
  };

  const removeDocument = async (idx: number) => {
    const doc = form.documents[idx];
    if (doc?.publicId) {
      await fetch(`${BASE}/api/upload/cloudinary/destroy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicId: doc.publicId }) });
    }
    setForm(f => ({ ...f, documents: f.documents.filter((_, i) => i !== idx) }));
  };

  const removePhoto = async () => {
    if (form.photoPublicId) {
      await fetch(`${BASE}/api/upload/cloudinary/destroy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicId: form.photoPublicId }) });
    }
    setForm(f => ({ ...f, photoUrl: "", photoPublicId: "" }));
  };

  const parseResponse = async (res: Response) => {
    const text = await res.text();
    if (!res.ok) {
      let errorMessage = res.statusText || "Request failed";
      if (text) {
        try {
          const body = JSON.parse(text);
          errorMessage = body?.error || body?.message || text;
        } catch {
          errorMessage = text;
        }
      }
      throw new Error(errorMessage);
    }
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        role: form.role,
        phone: form.phone || null,
        cnic: form.cnic || null,
        address: form.address || null,
        photoUrl: form.photoUrl || null,
        photoPublicId: form.photoPublicId || null,
        documents: form.documents,
        permissions: form.permissions,
        isActive: form.isActive,
      };
      if (form.password) payload.password = form.password;
      const url = editing ? `${BASE}/api/users/${editing.id}` : `${BASE}/api/users`;
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      return parseResponse(res);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["users"] }); setOpen(false); toast({ title: `✅ User ${editing ? "updated" : "created"}` }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const changePwMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/auth/change-password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: pwUserId, newPassword: newPw, requestedBy: currentUser?.name }) });
      await parseResponse(res);
    },
    onSuccess: () => { setPwOpen(false); toast({ title: "✅ Password changed" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await fetch(`${BASE}/api/users/${id}`, { method: "DELETE" }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["users"] }); toast({ title: "User deleted" }); },
  });

  const safeUsers = Array.isArray(users) ? users : [];
  const filtered = safeUsers.filter(u => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()));

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Users2 className="w-6 h-6 text-primary" /> Employees</h1>
            <p className="text-muted-foreground text-sm mt-1">Staff records, roles, permissions & documents</p>
          </div>
          {isCeo && <Button onClick={openAdd} className="bg-primary hover:bg-primary/90 gap-2"><Plus className="w-4 h-4" /> Add User</Button>}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {["ceo","developer","manager","sales"].map(role => {
            const count = safeUsers.filter(u => u.role === role).length;
            if (!count) return null;
            return (
              <Card key={role} className="border-border bg-card">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-primary">{count}</p>
                  <p className="text-xs text-muted-foreground capitalize mt-1">{role}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <Input placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs bg-background/50 border-border h-9" />
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Permissions</TableHead><TableHead>Status</TableHead>
                  {isCeo && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No users found</TableCell></TableRow>
                ) : filtered.map(u => (
                  <TableRow key={u.id} className="border-border hover:bg-accent/30">
                    <TableCell><div><p className="font-medium text-sm">{u.name}</p>{u.phone && <p className="text-xs text-muted-foreground">{u.phone}</p>}</div></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell><Badge className={`border text-xs capitalize ${roleColors[u.role] || "bg-muted text-muted-foreground border-0"}`}>{u.role}</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Shield className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {u.role === "ceo" || u.role === "developer" ? "All Access" : `${u.permissions?.length || 0} perms`}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell><Badge className={u.isActive ? "bg-green-500/10 text-green-400 border-0" : "bg-red-500/10 text-red-400 border-0"}>{u.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                    {isCeo && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="h-8 w-8 p-0"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent className="bg-card border-border" align="end">
                            <DropdownMenuItem onClick={() => openEdit(u)} className="gap-2 cursor-pointer hover:bg-accent"><Edit className="w-4 h-4" />Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openPw(u.id)} className="gap-2 cursor-pointer hover:bg-accent"><Key className="w-4 h-4" />Change Password</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => deleteMutation.mutate(u.id)} className="gap-2 cursor-pointer text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" />Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit User" : "Add New User"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Full Name</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="bg-background/50 border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Email</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="bg-background/50 border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Phone</Label>
                <Input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="bg-background/50 border-border" />
              </div>
              {!editing && (
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Password</Label>
                  <div className="relative">
                    <Input type={showPw ? "text" : "password"} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="bg-background/50 border-border pr-10" />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><EyeOff className="w-4 h-4" /></button>
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Role</Label>
                <Select value={form.role} onValueChange={applyPreset}>
                  <SelectTrigger className="bg-background/50 border-border"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">{ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">CNIC</Label>
                <Input value={form.cnic} onChange={e => setForm(f => ({ ...f, cnic: e.target.value }))} className="bg-background/50 border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Address</Label>
                <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="bg-background/50 border-border" />
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Profile Photo</Label>
                <div className="rounded-lg border border-border bg-background/80 p-3">
                  {form.photoUrl ? (
                    <div className="relative">
                      <img src={form.photoUrl} alt="Employee" className="h-28 w-28 rounded-lg object-cover border border-border" />
                      <button type="button" className="absolute top-2 right-2 rounded-full bg-destructive/90 px-2 py-1 text-xs text-white" onClick={removePhoto}>Remove</button>
                    </div>
                  ) : (
                    <div className="border-dashed border border-primary/40 rounded-lg p-6 text-center text-sm text-muted-foreground">
                      <p>Upload a photo (JPG, PNG)</p>
                      <p className="mt-2 text-xs text-muted-foreground/70">Click below or drag a file here</p>
                    </div>
                  )}
                  <div className="mt-3 flex flex-col gap-2">
                    <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) handlePhotoUpload(file); e.target.value = ""; }} />
                    <Button variant="outline" onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto} className="border-border">
                      {uploadingPhoto ? "Uploading..." : form.photoUrl ? "Replace Photo" : "Upload Photo"}
                    </Button>
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Documents</Label>
                <div className="rounded-lg border border-border bg-background/80 p-3">
                  <div className="space-y-2">
                    {form.documents.length > 0 ? (
                      form.documents.map((doc, idx) => (
                        <div key={`${doc.url}-${idx}`} className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-card px-3 py-2">
                          <div>
                            <p className="text-sm font-medium truncate">{doc.name}</p>
                            <p className="text-xs text-muted-foreground">{doc.type || "Document"}</p>
                          </div>
                          <button type="button" onClick={() => removeDocument(idx)} className="text-xs text-destructive hover:text-destructive/80">Remove</button>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No documents uploaded yet. Upload CNIC, CV, or other employee files.</p>
                    )}
                  </div>
                  <div className="mt-3 flex flex-col gap-2">
                    <input ref={docInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) handleDocumentUpload(file); e.target.value = ""; }} />
                    <Button variant="outline" onClick={() => docInputRef.current?.click()} disabled={uploadingDoc} className="border-border">
                      {uploadingDoc ? "Uploading..." : "Upload Document"}
                    </Button>
                  </div>
                </div>
                {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: !!v }))} />
              <span className="text-sm text-muted-foreground">Account Active</span>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2"><Shield className="w-3 h-3" />Permissions ({form.permissions.length} selected)</Label>
              {(form.role === "ceo" || form.role === "developer") ? (
                <p className="text-xs text-yellow-400 bg-yellow-500/10 rounded px-3 py-2">CEO & Developer have full system access — all permissions granted automatically.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                  {ALL_PERMISSIONS.map(p => (
                    <div key={p.key} className="flex items-center gap-2 cursor-pointer" onClick={() => togglePerm(p.key)}>
                      <Checkbox checked={form.permissions.includes(p.key)} onCheckedChange={() => togglePerm(p.key)} />
                      <span className="text-xs text-muted-foreground">{p.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="border-border">Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name || !form.email} className="bg-primary hover:bg-primary/90">
              {saveMutation.isPending ? "Saving..." : editing ? "Update" : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Key className="w-4 h-4 text-primary" />Change Password</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">New Password</Label>
              <div className="relative">
                <Input type={showPw ? "text" : "password"} value={newPw} onChange={e => setNewPw(e.target.value)} className="bg-background/50 border-border pr-10" placeholder="Min 6 characters" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{showPw ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}</button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwOpen(false)} className="border-border">Cancel</Button>
            <Button onClick={() => changePwMutation.mutate()} disabled={changePwMutation.isPending || newPw.length < 6} className="bg-primary hover:bg-primary/90">
              {changePwMutation.isPending ? "Changing..." : "Change Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
