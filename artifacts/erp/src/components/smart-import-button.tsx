import { useRef, useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetProductsQueryKey,
  getGetCustomersQueryKey,
  getGetSuppliersQueryKey,
  getGetPurchasesQueryKey,
  getGetSalesQueryKey,
  getGetExpensesQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type SmartImportResult = {
  success?: boolean;
  message?: string;
  importedProducts?: number;
  importedCustomers?: number;
  importedSuppliers?: number;
  importedPurchases?: number;
  importedSales?: number;
  importedExpenses?: number;
  sheetsProcessed?: number;
  skippedSheets?: string[];
  errors?: string[];
  error?: string;
};

/**
 * One AI-powered import button, reused across Sales / Purchases / Customers /
 * Suppliers / Expenses. No matter which tab the file is uploaded from, the
 * server reads every sheet in the Excel/CSV, figures out what each sheet is
 * (products, customers, suppliers, purchases, sales, expenses), and inserts
 * everything into the right tables in one go.
 */
export function SmartImportButton({ label = "AI Smart Import", className = "" }: { label?: string; className?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: getGetProductsQueryKey(), exact: false });
    qc.invalidateQueries({ queryKey: getGetCustomersQueryKey(), exact: false });
    qc.invalidateQueries({ queryKey: getGetSuppliersQueryKey(), exact: false });
    qc.invalidateQueries({ queryKey: getGetPurchasesQueryKey(), exact: false });
    qc.invalidateQueries({ queryKey: getGetSalesQueryKey(), exact: false });
    qc.invalidateQueries({ queryKey: getGetExpensesQueryKey(), exact: false });
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await customFetch<SmartImportResult>("/api/import/ai/smart", {
        method: "POST",
        body: formData,
      });

      invalidateAll();

      const parts = [
        result.importedSales ? `${result.importedSales} Sales` : null,
        result.importedPurchases ? `${result.importedPurchases} Purchases` : null,
        result.importedCustomers ? `${result.importedCustomers} Customers` : null,
        result.importedSuppliers ? `${result.importedSuppliers} Suppliers` : null,
        result.importedProducts ? `${result.importedProducts} Products` : null,
        result.importedExpenses ? `${result.importedExpenses} Expenses` : null,
      ].filter(Boolean);

      toast({
        title: parts.length ? "✅ Import complete" : "Kuch import nahi hua",
        description: parts.length ? parts.join(", ") : (result.message || "File ke columns pehchane nahi ja sake."),
        variant: parts.length ? undefined : "destructive",
      });

      if (result.skippedSheets && result.skippedSheets.length) {
        toast({ title: "Kuch sheets skip hui", description: result.skippedSheets.join(", "), variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Import failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
      <Button
        variant="outline"
        className={`gap-2 ${className}`}
        disabled={importing}
        onClick={() => inputRef.current?.click()}
      >
        {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {importing ? "Importing..." : label}
      </Button>
    </>
  );
}
