import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Settings2, Building2, Palette, Bell, Calendar, Plus, Trash2, Check, Clock, Bot, Mail, Key, Download, Upload, Database, Send, Eye } from "lucide-react";
import Confirm from "@/components/ui/confirm";
import { useToast } from "@/hooks/use-toast";
import { customFetch } from "@workspace/api-client-react";

const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

type CompanySettings = {
  name: string; address: string; phone: string; email: string;
  website: string; ntn: string; strn: string; branch: string;
  ceoName: string; ceoPhone: string; ceoEmail: string;
};
type Schedule = {
  id: number; report_type: string; frequency: string;
  send_to: string[]; whatsapp_numbers: string[]; is_active: boolean; last_sent?: string;
};

const REPORT_TYPES = ["daily-summary", "weekly-report", "monthly-report", "inventory-alert", "profit-loss", "full-report"];
const FREQUENCIES = ["daily", "weekly", "monthly"];
const ROLES = ["ceo", "developer", "manager", "accountant", "all"];

export default function Settings() {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [company, setCompany] = useState<CompanySettings>({
    name: "Al Ghani Wholesale Traders", address: "Shop No. 12, Hafeez Centre, Gulberg III, Lahore",
    phone: "+92-42-35761234", email: "info@alghani.com", website: "www.alghani.com",
    ntn: "1234567-8", strn: "12-34-5678-001-23", branch: "Main Branch - Lahore",
    ceoName: "Junaid Malik", ceoPhone: "+92-300-1234567", ceoEmail: "junaid@alghani.pk",
  });
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [newSchedule, setNewSchedule] = useState({ reportType: "daily-summary", frequency: "daily", sendTo: [] as string[], whatsappNumbers: [] as string[], newRole: "", newWhatsapp: "" });
  const [telegramStatus, setTelegramStatus] = useState<{ enabled: boolean; hasToken: boolean; hasChatId: boolean } | null>(null);
  const [telegramChatId, setTelegramChatId] = useState("");
  const [telegramSending, setTelegramSending] = useState(false);
  const [emailPreview, setEmailPreview] = useState<{ subject: string; body: string } | null>(null);
  const [emailPreviewLoading, setEmailPreviewLoading] = useState(false);
  const [dbStats, setDbStats] = useState<Record<string, number> | null>(null);
  const [importing, setImporting] = useState(false);
  const [legacyImporting, setLegacyImporting] = useState(false);
  const [legacyImportResult, setLegacyImportResult] = useState<{ message?: string; importedProducts?: number; importedCustomers?: number; importedSuppliers?: number; importedPurchases?: number; importedSales?: number } | null>(null);

  const loadSettings = async () => {
    try {
      const data = await customFetch<{ company?: Partial<CompanySettings> }>("/api/settings");
      if (data.company) setCompany(c => ({ ...c, ...data.company }));
    } catch (error) {
      // Settings load failed, keep defaults silently.
    }
  };

  useEffect(() => {
    const load = async () => {
      await loadSettings();
      await loadSchedules();

      try {
        const status = await customFetch<typeof telegramStatus>("/api/telegram/status");
        setTelegramStatus(status);
      } catch (error) {
        // Telegram status load failed silently.
      }

      try {
        const stats = await customFetch<{ tables: Record<string, number> }>("/api/backup/stats");
        setDbStats(stats.tables || null);
      } catch (error) {
        // Backup stats load failed silently.
      }
    };

    load();
  }, []);

  const loadSchedules = async () => {
    try {
      const data = await customFetch<Schedule[]>("/api/settings/report-schedules");
      setSchedules(Array.isArray(data) ? data : []);
    } catch (error) {
      setSchedules([]);
    }
  };

  const saveCompany = async () => {
    setSaving(true);
    try {
      await customFetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company }),
      });
      toast({ title: "✅ Saved", description: "Company details updated." });
      await loadSettings();
    } catch {
      toast({ title: "Error", description: "Failed to save.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addSchedule = async () => {
    try {
      await customFetch("/api/settings/report-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportType: newSchedule.reportType, frequency: newSchedule.frequency, sendTo: newSchedule.sendTo, whatsappNumbers: newSchedule.whatsappNumbers }),
      });
      toast({ title: "Schedule created" }); setScheduleOpen(false); loadSchedules();
    } catch { toast({ title: "Error", variant: "destructive" }); }
  };

  const sendTelegramTest = async () => {
    setTelegramSending(true);
    try {
      const d = await customFetch<{ success: boolean; error?: string }>("/api/telegram/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: telegramChatId || undefined }),
      });
      if (d.success) toast({ title: "✅ Telegram Sent!", description: "Test message delivered." });
      else toast({ title: "Failed", description: d.error, variant: "destructive" });
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    finally { setTelegramSending(false); }
  };

  const sendTelegramReport = async (type: string) => {
    setTelegramSending(true);
    try {
      const d = await customFetch<{ success: boolean; error?: string }>("/api/telegram/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportType: type }),
      });
      if (d.success) toast({ title: "✅ Report Sent to Telegram!" });
      else toast({ title: "Failed", description: d.error, variant: "destructive" });
    } catch { toast({ title: "Error", variant: "destructive" }); }
    finally { setTelegramSending(false); }
  };

  const previewEmail = async () => {
    setEmailPreviewLoading(true);
    try {
      const data = await customFetch<{ subject: string; body: string }>("/api/email/preview-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportType: "daily-summary" }),
      });
      setEmailPreview(data);
    } catch { toast({ title: "Preview failed", variant: "destructive" }); }
    finally { setEmailPreviewLoading(false); }
  };

  const sendEmail = async () => {
    try {
      const d = await customFetch<{ success: boolean; message?: string }>("/api/email/send-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportType: "daily-summary", recipients: [company.ceoEmail] }),
      });
      if (d.success) toast({ title: "✅ Email sent!" });
      else toast({ title: d.message || "SMTP not configured", description: "Set SMTP_HOST, SMTP_USER, SMTP_PASS in server env vars.", variant: "destructive" });
    } catch { toast({ title: "Error", variant: "destructive" }); }
  };

  const exportDB = async (format: "json" | "sql") => {
    try {
      const blob = await customFetch<Blob>(`${BASE}/api/backup/export/${format}`, { responseType: "blob" });
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `alghani-backup-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  const importDB = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const d = await customFetch<{ imported: number; errors?: string[] }>(`${BASE}/api/backup/import/json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      toast({ title: `✅ Import done`, description: `${d.imported} records restored. ${d.errors?.length ? d.errors.length + " errors." : ""}` });
    } catch (err) { toast({ title: "Import failed", description: (err as Error).message, variant: "destructive" }); }
    finally { setImporting(false); e.target.value = ""; }
  };

  const importLegacyData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLegacyImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const d = await customFetch<{ message?: string; importedProducts?: number; importedCustomers?: number; importedSuppliers?: number; importedPurchases?: number; importedSales?: number }>(`${BASE}/api/import/legacy`, {
        method: "POST",
        body: formData,
      });
      setLegacyImportResult(d);
      toast({ title: "✅ Legacy data imported", description: d.message || "Your historical records are now available in ERP." });
    } catch (err) {
      toast({ title: "Legacy import failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLegacyImporting(false);
      e.target.value = "";
    }
  };


  const field = (label: string, key: keyof CompanySettings, type = "text") => (
    <div className="space-y-1">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Input type={type} value={company[key]} onChange={e => setCompany(c => ({ ...c, [key]: e.target.value }))} className="bg-background/50 border-border" />
    </div>
  );

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Settings2 className="w-6 h-6 text-primary" /> System Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">Company info, integrations, exports, and automation</p>
        </div>

        <Tabs defaultValue="company" className="space-y-4">
          <TabsList className="bg-card border border-border flex-wrap h-auto gap-1 p-1">
            {[["company", Building2, "Company"], ["reports", Calendar, "Schedules"], ["telegram", Bot, "Telegram"], ["email", Mail, "Email"], ["database", Database, "Database"], ["branding", Palette, "Brand"], ["apikeys", Key, "API Keys"]].map(([v, Icon, label]) => (
              <TabsTrigger key={v as string} value={v as string} className="data-[state=active]:bg-primary data-[state=active]:text-white gap-1.5 text-xs">
                <span className="hidden sm:block">{label as string}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── COMPANY ── */}
          <TabsContent value="company">
            <Card className="border-border bg-card">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" /> Company Information</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {field("Company Name", "name")}{field("Branch", "branch")}
                  {field("Phone", "phone", "tel")}{field("Email", "email", "email")}
                  {field("Website", "website")}{field("NTN Number", "ntn")}
                  {field("STRN Number", "strn")}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Address</Label>
                  <Input value={company.address} onChange={e => setCompany(c => ({ ...c, address: e.target.value }))} className="bg-background/50 border-border" />
                </div>
                <div className="border-t border-border pt-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3 font-semibold">CEO / Owner Details</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {field("CEO Name", "ceoName")}{field("CEO Phone", "ceoPhone", "tel")}{field("CEO Email", "ceoEmail", "email")}
                  </div>
                </div>
                <Button onClick={saveCompany} disabled={saving} className="bg-primary hover:bg-primary/90 gap-2">
                  <Check className="w-4 h-4" />{saving ? "Saving..." : "Save Company Settings"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── REPORT SCHEDULES ── */}
          <TabsContent value="reports">
            <Card className="border-border bg-card">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" /> Automated Report Schedules</CardTitle>
                <Button onClick={() => setScheduleOpen(true)} className="bg-primary hover:bg-primary/90 gap-2 h-8 text-xs w-full sm:w-auto"><Plus className="w-3 h-3" /> Add</Button>
              </CardHeader>
              <CardContent>
                {schedules.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground"><Bell className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>No schedules yet.</p></div>
                ) : (
                  <div className="space-y-3">
                    {schedules.map(s => (
                      <div key={s.id} className="flex items-center justify-between p-4 rounded-lg bg-background/50 border border-border">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm capitalize">{s.report_type.replace(/-/g, " ")}</span>
                            <Badge className={s.is_active ? "bg-green-500/10 text-green-400 border-0 text-xs" : "bg-muted text-muted-foreground border-0 text-xs"}>{s.is_active ? "Active" : "Paused"}</Badge>
                            <Badge className="bg-primary/10 text-primary border-0 text-xs capitalize">{s.frequency}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {s.send_to?.length > 0 && <span>Roles: {s.send_to.join(", ")} · </span>}
                            {s.whatsapp_numbers?.length > 0 && <span>WhatsApp: {s.whatsapp_numbers.join(", ")}</span>}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={async () => {
                              await customFetch(`/api/settings/report-schedules/${s.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ isActive: !s.is_active }),
                              });
                              loadSchedules();
                            }} className="h-8 text-xs">{s.is_active ? "Pause" : "Resume"}</Button>
                          <Confirm title="Delete schedule?" description="Remove this scheduled report." onConfirm={async () => { await customFetch(`/api/settings/report-schedules/${s.id}`, { method: "DELETE" }); loadSchedules(); }} trigger={<Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:bg-destructive/20 hover:text-destructive"><Trash2 className="w-3 h-3" /></Button>} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── TELEGRAM ── */}
          <TabsContent value="telegram">
            <Card className="border-border bg-card">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bot className="w-4 h-4 text-primary" /> Telegram Bot Integration</CardTitle></CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  {[["Bot Status", telegramStatus?.hasToken ? "✅ Token Set" : "❌ No Token", telegramStatus?.hasToken], ["Chat ID", telegramStatus?.hasChatId ? "✅ Configured" : "❌ Not Set", telegramStatus?.hasChatId]].map(([label, value, ok]) => (
                    <div key={label as string} className="p-3 rounded-lg bg-background/50 border border-border">
                      <p className="text-xs text-muted-foreground">{label as string}</p>
                      <p className={`text-sm font-medium mt-1 ${ok ? "text-green-400" : "text-yellow-400"}`}>{value as string}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Test Chat ID (optional)</Label>
                  <div className="flex gap-2">
                    <Input value={telegramChatId} onChange={e => setTelegramChatId(e.target.value)} placeholder="Leave blank to use TELEGRAM_CHAT_ID env" className="bg-background/50 border-border" />
                    <Button onClick={sendTelegramTest} disabled={telegramSending} className="bg-primary hover:bg-primary/90 whitespace-nowrap">Test Send</Button>
                  </div>
                </div>
                <div className="border-t border-border pt-4">
                  <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wider">Send Reports Now</p>
                  <div className="grid grid-cols-2 gap-2">
                    {["summary", "daily-summary", "weekly-report", "monthly-report"].map(type => (
                      <Button key={type} size="sm" variant="outline" onClick={() => sendTelegramReport(type)} disabled={telegramSending} className="border-border gap-2 text-xs capitalize">
                        <Send className="w-3 h-3" />{type.replace(/-/g, " ")}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs text-blue-400 space-y-1">
                  <p className="font-semibold">Setup Instructions:</p>
                  <p>1. Create bot via @BotFather on Telegram</p>
                  <p>2. Add <code>TELEGRAM_BOT_TOKEN</code> to server environment</p>
                  <p>3. Message your bot and get your chat ID: /chatid</p>
                  <p>4. Add <code>TELEGRAM_CHAT_ID</code> to server environment</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── EMAIL ── */}
          <TabsContent value="email">
            <Card className="border-border bg-card">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Mail className="w-4 h-4 text-primary" /> AI Email Reports (Groq)</CardTitle></CardHeader>
              <CardContent className="space-y-5">
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 text-sm space-y-1">
                  <p className="font-medium text-white">Groq AI writes professional report emails automatically</p>
                  <p className="text-xs text-muted-foreground">Requires GROQ_API_KEY + SMTP settings in server environment variables.</p>
                </div>
                <div className="flex gap-3">
                  <Button onClick={previewEmail} disabled={emailPreviewLoading} variant="outline" className="border-border gap-2">
                    <Eye className="w-4 h-4" />{emailPreviewLoading ? "Generating..." : "Preview AI Email"}
                  </Button>
                  <Button onClick={sendEmail} className="bg-primary hover:bg-primary/90 gap-2">
                    <Send className="w-4 h-4" />Send to CEO
                  </Button>
                </div>
                {emailPreview && (
                  <div className="space-y-2">
                    <div className="p-3 rounded bg-background/50 border border-border">
                      <p className="text-xs text-muted-foreground mb-1">Subject:</p>
                      <p className="text-sm font-medium">{emailPreview.subject}</p>
                    </div>
                    <div className="p-3 rounded bg-background/50 border border-border max-h-60 overflow-y-auto">
                      <p className="text-xs text-muted-foreground mb-1">Email Body:</p>
                      <p className="text-xs whitespace-pre-wrap leading-relaxed">{emailPreview.body}</p>
                    </div>
                  </div>
                )}
                <div className="p-4 rounded-lg bg-yellow-500/5 border border-yellow-500/20 text-xs text-yellow-400 space-y-1">
                  <p className="font-semibold">SMTP Setup (add to server env vars):</p>
                  <p>SMTP_HOST=smtp.gmail.com · SMTP_PORT=587</p>
                  <p>SMTP_USER=your@gmail.com · SMTP_PASS=app-password</p>
                  <p>CEO_EMAIL=junaid@alghani.pk</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── DATABASE ── */}
          <TabsContent value="database">
            <Card className="border-border bg-card">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Database className="w-4 h-4 text-primary" /> Database Management</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                {dbStats && (
                  <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                    {Object.entries(dbStats).map(([table, count]) => (
                      <div key={table} className="p-3 rounded-lg bg-background/50 border border-border text-center">
                        <p className="text-lg font-bold text-primary">{count}</p>
                        <p className="text-xs text-muted-foreground capitalize">{table.replace(/_/g, " ")}</p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="border-t border-border pt-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3 font-medium">Export Database</p>
                  <div className="flex gap-3 flex-wrap">
                    <Button onClick={() => exportDB("json")} variant="outline" className="border-border gap-2"><Download className="w-4 h-4" />Export JSON</Button>
                    <Button onClick={() => exportDB("sql")} variant="outline" className="border-border gap-2"><Download className="w-4 h-4" />Export SQL</Button>
                  </div>
                </div>
                <div className="border-t border-border pt-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3 font-medium">Import Database (JSON Backup)</p>
                  <label className="cursor-pointer">
                    <div className="border-2 border-dashed border-border hover:border-primary/50 rounded-lg p-6 text-center transition-colors">
                      <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">{importing ? "Importing..." : "Click to upload JSON backup"}</p>
                    </div>
                    <input type="file" accept=".json" className="hidden" onChange={importDB} disabled={importing} />
                  </label>
                </div>

                <div className="border-t border-border pt-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3 font-medium">Legacy ERP Data Import</p>
                  <p className="text-sm text-muted-foreground mb-3">Upload a JSON file with products, customers, suppliers, purchases, and sales to bring old records into the new ERP.</p>
                  <label className="cursor-pointer">
                    <div className="border-2 border-dashed border-border hover:border-primary/50 rounded-lg p-6 text-center transition-colors">
                      <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">{legacyImporting ? "Importing legacy records..." : "Upload old business data"}</p>
                    </div>
                    <input type="file" accept=".json" className="hidden" onChange={importLegacyData} disabled={legacyImporting} />
                  </label>
                  {legacyImportResult && (
                    <div className="rounded-lg border border-border bg-background/50 p-3 text-sm text-muted-foreground mt-3">
                      <p className="font-medium text-foreground">{legacyImportResult.message}</p>
                      <p>Products: {legacyImportResult.importedProducts ?? 0} · Customers: {legacyImportResult.importedCustomers ?? 0} · Suppliers: {legacyImportResult.importedSuppliers ?? 0}</p>
                      <p>Purchases: {legacyImportResult.importedPurchases ?? 0} · Sales: {legacyImportResult.importedSales ?? 0}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── BRANDING ── */}
          <TabsContent value="branding">
            <Card className="border-border bg-card">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Palette className="w-4 h-4 text-primary" /> Brand Preview</CardTitle></CardHeader>
              <CardContent>
                <div className="p-6 rounded-lg bg-[#1a1a1a] border border-border">
                  <div className="flex items-center gap-4 mb-4">
                    <img src="/logo.jpg" alt="Logo" className="w-16 h-16 rounded-lg border border-primary/30" />
                    <div>
                      <p className="text-xl font-bold text-[#DC2626]">{company.name}</p>
                      <p className="text-sm text-[#D97706]">{company.branch}</p>
                      <p className="text-xs text-gray-400">{company.address}</p>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 space-y-1">
                    <p>{company.phone} · {company.email} · {company.website}</p>
                    <p>NTN: {company.ntn} · STRN: {company.strn}</p>
                    <p className="text-[#DC2626]">CEO: {company.ceoName} · {company.ceoPhone} · {company.ceoEmail}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-3">This branding appears on all exported reports.</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── API KEYS ── */}
          <TabsContent value="apikeys">
            <Card className="border-border bg-card">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Key className="w-4 h-4 text-primary" /> API Keys & Environment</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">Set these in your server environment variables (Replit Secrets or Vercel env vars):</p>
                {[
                  { key: "GROQ_API_KEY", label: "Groq AI API Key", desc: "For AI import (images/docs) and email writing. Get free at console.groq.com", link: "https://console.groq.com" },
                  { key: "TELEGRAM_BOT_TOKEN", label: "Telegram Bot Token", desc: "Create bot via @BotFather on Telegram", link: "https://t.me/BotFather" },
                  { key: "TELEGRAM_CHAT_ID", label: "CEO Telegram Chat ID", desc: "Message your bot and send /chatid to get your ID" },
                  { key: "SMTP_HOST", label: "SMTP Host", desc: "e.g., smtp.gmail.com" },
                  { key: "SMTP_PORT", label: "SMTP Port", desc: "587 (TLS) or 465 (SSL)" },
                  { key: "SMTP_USER", label: "SMTP Username", desc: "Your email address" },
                  { key: "SMTP_PASS", label: "SMTP Password", desc: "App password (not your login password)" },
                  { key: "JWT_SECRET", label: "JWT Secret", desc: "Random string for securing login tokens" },
                  { key: "DATABASE_URL", label: "Database URL", desc: "Neon PostgreSQL connection string for production" },
                ].map(item => (
                  <div key={item.key} className="flex items-start gap-3 p-3 rounded-lg bg-background/50 border border-border">
                    <code className="text-primary text-xs font-mono bg-primary/10 px-2 py-1 rounded whitespace-nowrap">{item.key}</code>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Schedule Dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader><DialogTitle>Add Report Schedule</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Report Type</Label>
              <Select value={newSchedule.reportType} onValueChange={v => setNewSchedule(s => ({ ...s, reportType: v }))}>
                <SelectTrigger className="bg-background/50 border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">{REPORT_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t.replace(/-/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Frequency</Label>
              <Select value={newSchedule.frequency} onValueChange={v => setNewSchedule(s => ({ ...s, frequency: v }))}>
                <SelectTrigger className="bg-background/50 border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">{FREQUENCIES.map(f => <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Send To (Roles)</Label>
              <div className="flex gap-2">
                <Select value={newSchedule.newRole} onValueChange={v => setNewSchedule(s => ({ ...s, newRole: v }))}>
                  <SelectTrigger className="bg-background/50 border-border flex-1"><SelectValue placeholder="Select role..." /></SelectTrigger>
                  <SelectContent className="bg-card border-border">{ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
                </Select>
                <Button size="sm" variant="outline" className="border-border" onClick={() => { if (newSchedule.newRole && !newSchedule.sendTo.includes(newSchedule.newRole)) setNewSchedule(s => ({ ...s, sendTo: [...s.sendTo, s.newRole], newRole: "" })); }}><Plus className="w-4 h-4" /></Button>
              </div>
              <div className="flex flex-wrap gap-1">{newSchedule.sendTo.map(r => <Badge key={r} className="bg-primary/10 text-primary border-0 cursor-pointer" onClick={() => setNewSchedule(s => ({ ...s, sendTo: s.sendTo.filter(x => x !== r) }))}>{r} ×</Badge>)}</div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">WhatsApp Numbers</Label>
              <div className="flex gap-2">
                <Input placeholder="+92300..." value={newSchedule.newWhatsapp} onChange={e => setNewSchedule(s => ({ ...s, newWhatsapp: e.target.value }))} className="bg-background/50 border-border flex-1" />
                <Button size="sm" variant="outline" className="border-border" onClick={() => { if (newSchedule.newWhatsapp) setNewSchedule(s => ({ ...s, whatsappNumbers: [...s.whatsappNumbers, s.newWhatsapp], newWhatsapp: "" })); }}><Plus className="w-4 h-4" /></Button>
              </div>
              <div className="flex flex-wrap gap-1">{newSchedule.whatsappNumbers.map(n => <Badge key={n} className="bg-green-500/10 text-green-400 border-0 cursor-pointer text-xs" onClick={() => setNewSchedule(s => ({ ...s, whatsappNumbers: s.whatsappNumbers.filter(x => x !== n) }))}>{n} ×</Badge>)}</div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)} className="border-border">Cancel</Button>
            <Button onClick={addSchedule} className="bg-primary hover:bg-primary/90">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
