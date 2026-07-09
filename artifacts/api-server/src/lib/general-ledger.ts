import { generalLedgerEntriesTable } from "@workspace/db";
import type { DbTx } from "./ledger.js";
import { round2 } from "./ledger.js";

export type GeneralLedgerType =
  | "sale"
  | "purchase"
  | "expense"
  | "salary"
  | "staff_advance"
  | "supplier_payment"
  | "customer_payment"
  | "adjustment";

export type PartyType = "customer" | "supplier" | "staff" | "none";

/**
 * Appends one row to the unified cross-module ledger feed. This is a
 * denormalized, read-oriented log — it does NOT compute or maintain a
 * running balance (unlike customer_ledger_entries / staff_ledger_entries /
 * supplier_ledger_entries, which remain the source of truth for balances).
 * Call this in addition to, never instead of, the module-specific ledger
 * writer. Safe to call inside or outside a transaction.
 */
export async function appendGeneralLedgerEntry(
  tx: DbTx,
  params: {
    date: Date;
    type: GeneralLedgerType;
    referenceId?: number | null;
    partyType?: PartyType;
    partyId?: number | null;
    partyName?: string | null;
    amount: number;
    direction: "credit" | "debit";
    note?: string | null;
    createdByUserId?: number | null;
  },
) {
  const [entry] = await tx
    .insert(generalLedgerEntriesTable)
    .values({
      date: params.date,
      type: params.type,
      referenceId: params.referenceId ?? null,
      partyType: params.partyType ?? "none",
      partyId: params.partyId ?? null,
      partyName: params.partyName ?? null,
      amount: String(round2(Math.abs(params.amount))),
      direction: params.direction,
      note: params.note ?? null,
      createdByUserId: params.createdByUserId ?? null,
    })
    .returning();
  return entry;
}
