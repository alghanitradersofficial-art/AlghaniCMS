import { useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Package, BellRing, Plus, Trash2, CheckCircle2 } from "lucide-react";

type Adjustment = {
  id: number;
  productId: number;
  productName?: string;
  direction: "increase" | "decrease";
  quantity: number;
  reason: string;
  notes?: string | null;
  createdAt: string;
};

type Reminder = {
  id: number;
  title: string;
  description?: string | null;
  dueDate: string;
  isCompleted: boolean;
};

export default function Operations() {
  const qc = useQueryClient();
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [productId, setProductId] = useState("");
  const [direction, setDirection] = useState("increase");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderDate, setReminderDate] = useState(new Date().toISOString().slice(0, 10));
  const [reminderDescription, setReminderDescription] = useState("");

  const loadData = async () => {
    const [adjRes, remRes] = await Promise.all([apiGet<{ data: Adjustment[] }>('/api/stock-adjustments'), apiGet<{ data: Reminder[] }>('/api/reminders')]);
    setAdjustments(adjRes.data);
    setReminders(remRes.data);
  };

  useEffect(() => { loadData(); }, []);

  const handleSaveAdjustment = async () => {
    if (!productId || !reason) return;
    await apiPost('/api/stock-adjustments', { productId: Number(productId), direction, quantity: Number(quantity), reason, notes });
    setReason(""); setNotes(""); setQuantity("1"); setProductId("");
    await loadData();
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const handleSaveReminder = async () => {
    if (!reminderTitle) return;
    await apiPost('/api/reminders', { title: reminderTitle, description: reminderDescription, dueDate: new Date(reminderDate).toISOString() });
    setReminderTitle(""); setReminderDate(new Date().toISOString().slice(0, 10)); setReminderDescription("");
    await loadData();
  };

  const handleToggleReminder = async (id: number, completed: boolean) => {
    await apiPatch(`/api/reminders/${id}`, { isCompleted: completed });
    await loadData();
  };

  const handleDeleteReminder = async (id: number) => {
    await apiDelete(`/api/reminders/${id}`);
    await loadData();
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Package className="w-6 h-6 text-primary" /> Operations</h1>
          <p className="text-muted-foreground text-sm mt-1">Track stock adjustments and dues in one place.</p>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="border-border bg-card">
            <CardHeader><CardTitle className="flex items-center gap-2"><Package className="w-5 h-5" /> Stock adjustments</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label>Product ID</Label>
                <Input type="number" value={productId} onChange={(e) => setProductId(e.target.value)} className="bg-background/50 border-border" />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Direction</Label>
                  <Select value={direction} onValueChange={setDirection}>
                    <SelectTrigger className="bg-background/50 border-border"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="increase">Increase</SelectItem>
                      <SelectItem value="decrease">Decrease</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Quantity</Label>
                  <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="bg-background/50 border-border" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Reason</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} className="bg-background/50 border-border" />
              </div>
              <div className="space-y-1">
                <Label>Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="bg-background/50 border-border" />
              </div>
              <Button onClick={handleSaveAdjustment} className="bg-primary hover:bg-primary/90">Save adjustment</Button>
              <div className="space-y-2">
                {adjustments.map((item) => (
                  <div key={item.id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{item.productName || `Product ${item.productId}`}</p>
                        <p className="text-muted-foreground">{item.direction} by {item.quantity} — {item.reason}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader><CardTitle className="flex items-center gap-2"><BellRing className="w-5 h-5" /> Reminders</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label>Title</Label>
                <Input value={reminderTitle} onChange={(e) => setReminderTitle(e.target.value)} className="bg-background/50 border-border" />
              </div>
              <div className="space-y-1">
                <Label>Due date</Label>
                <Input type="date" value={reminderDate} onChange={(e) => setReminderDate(e.target.value)} className="bg-background/50 border-border" />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Input value={reminderDescription} onChange={(e) => setReminderDescription(e.target.value)} className="bg-background/50 border-border" />
              </div>
              <Button onClick={handleSaveReminder} className="bg-primary hover:bg-primary/90">Add reminder</Button>
              <div className="space-y-2">
                {reminders.map((item) => (
                  <div key={item.id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{item.title}</p>
                        <p className="text-muted-foreground">{item.description || "No additional notes"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost" onClick={() => handleToggleReminder(item.id, !item.isCompleted)} className="h-8 w-8 p-0"><CheckCircle2 className={`w-4 h-4 ${item.isCompleted ? "text-green-500" : "text-muted-foreground"}`} /></Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDeleteReminder(item.id)} className="h-8 w-8 p-0 hover:bg-destructive/20 hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Due {new Date(item.dueDate).toLocaleDateString()} • {item.isCompleted ? "Completed" : "Pending"}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
