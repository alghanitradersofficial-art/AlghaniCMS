import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCustomerLedger, useLedgerTimeline, useRecordPayment, useDeletePayment, type RecordPaymentInput } from "@/hooks/use-ledger";
import { useUpdateCustomer, getGetCustomersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Wallet, Receipt, ArrowDownCircle, ArrowUpCircle, AlertTriangle, ShieldCheck, Trash2, Plus, Loader2 } from "lucide-react";
import Confirm from "@/components/ui/confirm";

interface CustomerLedgerDialogProps {
  customerId: number | null;
  customerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const METHODS: Array<{ value: RecordPaymentInput["method"]; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "jazzcash", label: "JazzCash" },
  { value: "easypaisa", label: "Easypaisa" },
  { value: "other", label: "Other" },
];

export function CustomerLedgerDialog({ customerId, customerName, open, onOpenChange }: CustomerLedgerDialogProps) {
  const { data: ledger, isLoading, isError, error } = useCustomerLedger(customerId ?? undefined);
  const { data: timeline, isError: timelineError } = useLedgerTimeline(customerId ?? undefined);
  const recordPayment = useRecordPayment();
  const deletePayment = useDeletePayment();
  const updateCustomer = useUpdateCustomer();
  const qc = useQueryClient();

  const newRow = () => ({
    rowId: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    amount: "",
    method: "cash" as RecordPaymentInput["method"],
    reference: "",
    paymentDate: new Date().toISOString().split("T")[0],
  });

  const [paymentRows, setPaymentRows] = useState<Array<{ rowId: string; amount: string; method: RecordPaymentInput["method"]; reference: string; paymentDate: string }>>([newRow()]);
  const [isSubmittingPayments, setIsSubmittingPayments] = useState(false);
  const [creditLimitInput, setCreditLimitInput] = useState("");

  // Keep the credit limit input in sync with the loaded ledger data,
  // and whenever the dialog is opened for a different customer.
  useEffect(() => {
    if (ledger) setCreditLimitInput(String(ledger.creditLimit ?? 0));
  }, [ledger?.customerId, ledger?.creditLimit]);

  const handleSetCreditLimit = async () => {
    if (!customerId || creditLimitInput === "") return;
    try {
      await updateCustomer.mutateAsync({ id: customerId, data: { creditLimit: parseFloat(creditLimitInput) } });
      qc.invalidateQueries({ queryKey: ["customer-ledger", customerId] });
      qc.invalidateQueries({ queryKey: getGetCustomersQueryKey(), exact: false });
    } catch (err) {
      console.error("Failed to update credit limit:", err);
      alert(err instanceof Error ? err.message : "Failed to update credit limit. Please try again.");
    }
  };

  const addPaymentRow = () => setPaymentRows((rows) => [...rows, newRow()]);
  const removePaymentRow = (rowId: string) => setPaymentRows((rows) => (rows.length > 1 ? rows.filter((r) => r.rowId !== rowId) : rows));
  const updatePaymentRow = (rowId: string, patch: Partial<{ amount: string; method: RecordPaymentInput["method"]; reference: string; paymentDate: string }>) =>
    setPaymentRows((rows) => rows.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));

  const handleReceivePayments = async () => {
    if (!customerId) return;
    const validRows = paymentRows.filter((r) => r.amount && parseFloat(r.amount) > 0);
    if (validRows.length === 0) return;
    setIsSubmittingPayments(true);
    try {
      // paymentDate comes from an <input type="date"> as "YYYY-MM-DD".
      // Backend requires a full ISO-8601 datetime (z.string().datetime()),
      // so convert it here rather than sending the bare date string.
      for (const row of validRows) {
        const isoPaymentDate = new Date(`${row.paymentDate}T00:00:00.000Z`).toISOString();
        await recordPayment.mutateAsync({
          customerId,
          amount: parseFloat(row.amount),
          method: row.method,
          reference: row.reference || undefined,
          paymentDate: isoPaymentDate,
        });
      }
      // All payments recorded — reset the form and close the ledger so the
      // user isn't left staring at a stale/open dialog after submitting.
      setPaymentRows([newRow()]);
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to record payment:", err);
      alert(err instanceof Error ? err.message : "Failed to record payment. Please try again.");
    } finally {
      setIsSubmittingPayments(false);
    }
  };

  const handleDeletePayment = async (paymentId: number) => {
    try {
      await deletePayment.mutateAsync({ paymentId });
    } catch (err) {
      console.error("Failed to delete payment:", err);
      alert(err instanceof Error ? err.message : "Failed to delete payment. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wallet className="w-5 h-5 text-primary" /> {customerName} — Khata</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="text-center py-10 text-muted-foreground text-sm">Loading ledger…</div>
        ) : isError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <p className="font-semibold">Failed to load customer ledger</p>
            <p>{error instanceof Error ? error.message : "An unexpected error occurred."}</p>
          </div>
        ) : !ledger ? (
          <div className="text-center py-10 text-muted-foreground text-sm">No customer ledger available.</div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard label="Current Balance" value={ledger.currentBalance} highlight={ledger.currentBalance > 0 ? "negative" : "positive"} />
              <StatCard label="Outstanding" value={ledger.outstandingAmount} highlight="negative" />
              <StatCard label="Advance" value={ledger.advanceBalance} highlight="positive" />
              <StatCard label="Credit Limit" value={ledger.creditLimit} />
              <StatCard label="Available Credit" value={ledger.availableCredit} highlight="positive" />
              <StatCard label="Total Sales" value={ledger.totalSales} />
            </div>

            {ledger.currentBalance > ledger.creditLimit && ledger.creditLimit > 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-red-500/10 text-red-400 text-xs px-3 py-2">
                <AlertTriangle className="w-4 h-4 shrink-0" /> Customer has exceeded their credit limit.
              </div>
            )}
            {ledger.oldestUnpaidInvoice && ledger.overdueDays > 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-yellow-500/10 text-yellow-400 text-xs px-3 py-2">
                <AlertTriangle className="w-4 h-4 shrink-0" /> Oldest unpaid invoice {ledger.oldestUnpaidInvoice.invoiceNumber} is {ledger.overdueDays} days old (Rs. {ledger.oldestUnpaidInvoice.outstanding.toLocaleString()}).
              </div>
            )}

            <div className="border-t border-border pt-4">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Receive Payment</Label>
              <div className="space-y-2">
                {paymentRows.map((row, idx) => (
                  <div key={row.rowId} className="flex flex-wrap gap-2 items-center">
                    <Input type="number" placeholder="Amount" value={row.amount} onChange={e => updatePaymentRow(row.rowId, { amount: e.target.value })} className="w-32 bg-background/50 border-border" />
                    <Select value={row.method} onValueChange={v => updatePaymentRow(row.rowId, { method: v as RecordPaymentInput["method"] })}>
                      <SelectTrigger className="w-40 bg-background/50 border-border"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        {METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input placeholder="Reference (optional)" value={row.reference} onChange={e => updatePaymentRow(row.rowId, { reference: e.target.value })} className="flex-1 min-w-[140px] bg-background/50 border-border" />
                    <Input type="date" value={row.paymentDate} onChange={e => updatePaymentRow(row.rowId, { paymentDate: e.target.value })} className="bg-background/50 border-border" />
                    {paymentRows.length > 1 && (
                      <Button size="sm" variant="ghost" onClick={() => removePaymentRow(row.rowId)} className="h-9 w-9 p-0 text-destructive hover:bg-destructive/10" title="Remove this payment">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={addPaymentRow} className="border-border gap-1.5"><Plus className="w-3.5 h-3.5" /> Add New Payment</Button>
                  <Button
                    onClick={handleReceivePayments}
                    disabled={paymentRows.every(r => !r.amount) || isSubmittingPayments}
                    className="bg-primary hover:bg-primary/90 gap-1.5"
                  >
                    {isSubmittingPayments && <Loader2 className="w-4 h-4 animate-spin" />}
                    {paymentRows.length > 1 ? "Record Payments" : "Receive"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Set Credit Limit</Label>
              <div className="flex flex-wrap gap-2">
                <Input type="number" min="0" step="0.01" placeholder="Credit limit" value={creditLimitInput} onChange={e => setCreditLimitInput(e.target.value)} className="w-40 bg-background/50 border-border" />
                <Button onClick={handleSetCreditLimit} disabled={creditLimitInput === "" || updateCustomer.isPending} variant="outline" className="border-border">Save Limit</Button>
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block flex items-center gap-1.5"><Receipt className="w-3.5 h-3.5" /> Ledger Timeline</Label>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {timelineError ? (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    Failed to load timeline entries.
                  </div>
                ) : timeline?.data.length ? timeline.data.map(entry => (
                  <div key={entry.id} className="flex items-center justify-between text-xs border-b border-border/50 pb-2">
                    <div className="flex items-center gap-2">
                      {entry.amount >= 0 ? <ArrowUpCircle className="w-4 h-4 text-red-400" /> : <ArrowDownCircle className="w-4 h-4 text-green-400" />}
                      <div>
                        <div className="font-medium">{entry.description || entry.type}</div>
                        <div className="text-muted-foreground">{new Date(entry.date).toLocaleString()}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className={entry.amount >= 0 ? "text-red-400 font-semibold" : "text-green-400 font-semibold"}>
                          {entry.amount >= 0 ? "+" : ""}Rs. {entry.amount.toLocaleString()}
                        </div>
                        <div className="text-muted-foreground">Bal: Rs. {entry.runningBalance.toLocaleString()}</div>
                      </div>
                      {entry.type === "payment" && entry.paymentId && (
                        <Confirm
                          title="Delete this payment?"
                          description="Use this if a payment was accidentally saved twice or entered incorrectly. It will be removed and the customer's balance recalculated automatically."
                          onConfirm={() => handleDeletePayment(entry.paymentId!)}
                          trigger={
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10" disabled={deletePayment.isPending}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          }
                        />
                      )}
                    </div>
                  </div>
                )) : <div className="text-xs text-muted-foreground text-center py-6">No transactions yet.</div>}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: "positive" | "negative" }) {
  const color = highlight === "negative" && value > 0 ? "text-red-400" : highlight === "positive" && value > 0 ? "text-green-400" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold ${color}`}>Rs. {value.toLocaleString()}</div>
    </div>
  );
}
