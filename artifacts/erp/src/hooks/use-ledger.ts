import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

// ---------------------------------------------------------------------------
// Types (hand-written to mirror the new backend endpoints in
// artifacts/api-server/src/routes/{ledger,price-history,payments}.ts)
// ---------------------------------------------------------------------------

export interface CustomerLedgerSummary {
  customerId: number;
  openingBalance: number;
  currentBalance: number;
  outstandingAmount: number;
  advanceBalance: number;
  creditLimit: number;
  availableCredit: number;
  totalSales: number;
  totalPayments: number;
  numberOfPendingInvoices: number;
  oldestUnpaidInvoice: { invoiceNumber: string; date: string; outstanding: number } | null;
  overdueDays: number;
  lastPayment: { id: number; amount: number; method: string; date: string } | null;
}

export interface PriceHistorySale {
  invoiceNumber: string;
  invoiceDate: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  finalPrice: number;
  profitAmount: number;
  profitPercentage: number;
}

export interface PriceHistoryResponse {
  hasHistory: boolean;
  lastSellingPrice?: number;
  lastPurchaseDate?: string;
  lastInvoiceNumber?: string;
  lastQuantity?: number;
  daysSinceLastPurchase?: number;
  previousSales?: PriceHistorySale[];
  lowestPriceEver?: number;
  highestPriceEver?: number;
  averageSellingPrice?: number;
  totalQuantityPurchased?: number;
  totalPurchaseValue?: number;
  totalProfitEarned?: number;
  totalOrders?: number;
}

export interface PriceSuggestion {
  productId: number;
  costPrice: number;
  suggestedSellingPrice: number;
  previousCustomerPrice: number | null;
  marketPrice: number | null;
  currentProfit: number;
  profitPercentage: number;
  differenceFromPreviousPrice: number | null;
  differenceFromCostPrice: number;
  minimumMarginPercent: number;
  requiresApproval: boolean;
  warnings: Array<{ level: "error" | "warning"; message: string }>;
}

export interface LedgerTimelineEntry {
  id: number;
  type: "sale" | "payment" | "adjustment" | "opening_balance";
  amount: number;
  runningBalance: number;
  saleId: number | null;
  paymentId: number | null;
  description: string | null;
  date: string;
}

export interface SupplierPurchaseOccurrence {
  purchaseId: number;
  poNumber: string;
  purchaseDate: string;
  quantity: number;
  unitCost: number;
  total: number;
}

export interface SupplierPriceHistoryResponse {
  hasHistory: boolean;
  lastCostPrice?: number;
  lastPurchaseDate?: string;
  lastPoNumber?: string;
  lastQuantity?: number;
  daysSincePurchase?: number;
  previousPurchases?: SupplierPurchaseOccurrence[];
  lowestCostEver?: number;
  highestCostEver?: number;
  averageCostPrice?: number;
  totalQuantityPurchased?: number;
  totalPurchaseValue?: number;
  totalOrders?: number;
}

export interface Payment {
  id: number;
  customerId: number;
  amount: number;
  method: string;
  bankName: string | null;
  chequeNumber: string | null;
  transactionId: string | null;
  reference: string | null;
  notes: string | null;
  paymentDate: string;
}

export interface PaymentSummary {
  lastPayment: Payment | null;
  secondLastPayment: Payment | null;
  lastTenPayments: Payment[];
  totalPaid: number;
  averagePayment: number;
  largestPayment: number;
  smallestPayment: number;
  paymentCount: number;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useCustomerLedger(customerId: number | undefined) {
  return useQuery({
    queryKey: ["customer-ledger", customerId],
    queryFn: () => customFetch<CustomerLedgerSummary>(`/api/customers/${customerId}/ledger`),
    enabled: !!customerId,
  });
}

export function useLedgerTimeline(customerId: number | undefined, page = 1) {
  return useQuery({
    queryKey: ["customer-ledger-timeline", customerId, page],
    queryFn: () => customFetch<{ data: LedgerTimelineEntry[]; page: number; limit: number }>(
      `/api/customers/${customerId}/ledger/timeline?page=${page}&limit=25`,
    ),
    enabled: !!customerId,
  });
}

export function usePriceHistory(customerId: number | undefined, productId: number | undefined, from?: string, to?: string) {
  return useQuery({
    queryKey: ["price-history", customerId, productId, from, to],
    queryFn: () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString() ? `?${params.toString()}` : "";
      return customFetch<PriceHistoryResponse>(`/api/customers/${customerId}/price-history/${productId}${qs}`);
    },
    enabled: !!customerId && !!productId,
  });
}

export function usePriceSuggestion(customerId: number | undefined, productId: number | undefined, proposedPrice?: number) {
  return useQuery({
    queryKey: ["price-suggestion", customerId, productId, proposedPrice],
    queryFn: () =>
      customFetch<PriceSuggestion>(
        `/api/customers/${customerId}/price-suggestion/${productId}${proposedPrice != null ? `?proposedPrice=${proposedPrice}` : ""}`,
      ),
    enabled: !!customerId && !!productId,
  });
}

export function useSupplierPriceHistory(supplierId: number | undefined, productId: number | undefined, from?: string, to?: string) {
  return useQuery({
    queryKey: ["supplier-price-history", supplierId, productId, from, to],
    queryFn: () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString() ? `?${params.toString()}` : "";
      return customFetch<SupplierPriceHistoryResponse>(`/api/suppliers/${supplierId}/price-history/${productId}${qs}`);
    },
    enabled: !!supplierId && !!productId,
  });
}

export function usePaymentSummary(customerId: number | undefined) {
  return useQuery({
    queryKey: ["payment-summary", customerId],
    queryFn: () => customFetch<PaymentSummary>(`/api/payments/customer/${customerId}/summary`),
    enabled: !!customerId,
  });
}

export function useVoidPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: number; reason: string }) =>
      customFetch<{ success: boolean }>(`/api/payments/${paymentId}/void`, { method: "POST", body: JSON.stringify({ reason }) }),
    onSuccess: () => {
      // We don't know the customerId here without threading it through, so
      // invalidate broadly — these queries are cheap and infrequent.
      qc.invalidateQueries({ queryKey: ["customer-ledger"], exact: false });
      qc.invalidateQueries({ queryKey: ["customer-ledger-timeline"], exact: false });
      qc.invalidateQueries({ queryKey: ["payment-summary"], exact: false });
      qc.invalidateQueries({ queryKey: ["outstanding-report"], exact: false });
    },
  });
}

export function useCustomerStatement(customerId: number | undefined, from?: string, to?: string) {
  return useQuery({
    queryKey: ["customer-statement", customerId, from, to],
    queryFn: () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      return customFetch(`/api/customers/${customerId}/statement?${params.toString()}`);
    },
    enabled: !!customerId,
  });
}

export function useOutstandingReport() {
  return useQuery({
    queryKey: ["outstanding-report"],
    queryFn: () => customFetch(`/api/customers/ledger/reports/outstanding`),
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface RecordPaymentInput {
  customerId: number;
  amount: number;
  method: "cash" | "bank_transfer" | "cheque" | "jazzcash" | "easypaisa" | "other";
  bankName?: string;
  chequeNumber?: string;
  transactionId?: string;
  reference?: string;
  notes?: string;
  paymentDate?: string;
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: RecordPaymentInput) =>
      customFetch<Payment>(`/api/payments`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["customer-ledger", variables.customerId] });
      qc.invalidateQueries({ queryKey: ["customer-ledger-timeline", variables.customerId] });
      qc.invalidateQueries({ queryKey: ["payment-summary", variables.customerId] });
      qc.invalidateQueries({ queryKey: ["outstanding-report"] });
    },
  });
}
