import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Download, FileText, FileSpreadsheet, FileDown } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";

const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

type ExportType = "sales" | "purchases" | "inventory" | "expenses" | "customers" | "suppliers" | "report";

interface ExportButtonsProps {
  type: ExportType;
  invoiceId?: number;
  compact?: boolean;
}

export function ExportButtons({ type, invoiceId, compact }: ExportButtonsProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const doExport = async (format: string) => {
    setLoading(format);
    try {
      let url = "";
      let filename = "alghani-export";

      if (invoiceId && format === "invoice-pdf") {
        url = `${BASE}/api/export/invoice/${invoiceId}/pdf`;
        filename = `invoice-${invoiceId}.pdf`;
      } else {
        url = `${BASE}/api/export/${type}/${format}`;
        const extension = format === "excel" ? "xlsx" : format;
        filename = `alghani-${type}.${extension}`;
      }

      const blob = await customFetch<Blob>(url, { responseType: "blob" });
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Keep loading state for a short time to show action feedback.
    } finally {
      setTimeout(() => setLoading(null), 2000);
    }
  };

  const hasPdf = ["sales", "purchases", "inventory", "expenses", "report"].includes(type);
  const hasExcel = true;

  if (compact) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="border-border gap-1.5 h-8 text-xs">
            <Download className="w-3 h-3" />Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="bg-card border-border" align="end">
          <DropdownMenuLabel className="text-xs text-muted-foreground uppercase">Export As</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-border" />
          {hasPdf && (
            <DropdownMenuItem onClick={() => doExport("pdf")} className="gap-2 cursor-pointer hover:bg-accent text-sm">
              <FileText className="w-4 h-4 text-red-400" />PDF {loading === "pdf" && "..."}
            </DropdownMenuItem>
          )}
          {hasExcel && (
            <DropdownMenuItem onClick={() => doExport("excel")} className="gap-2 cursor-pointer hover:bg-accent text-sm">
              <FileSpreadsheet className="w-4 h-4 text-green-400" />Excel (.xlsx) {loading === "excel" && "..."}
            </DropdownMenuItem>
          )}
          {type === "sales" && invoiceId && (
            <>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem onClick={() => doExport("invoice-pdf")} className="gap-2 cursor-pointer hover:bg-accent text-sm">
                <FileDown className="w-4 h-4 text-yellow-400" />Invoice PDF
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="flex gap-2">
      {hasPdf && (
        <Button onClick={() => doExport("pdf")} variant="outline" size="sm" className="border-border gap-2 text-xs" disabled={loading === "pdf"}>
          <FileText className="w-3 h-3 text-red-400" />{loading === "pdf" ? "..." : "PDF"}
        </Button>
      )}
      {hasExcel && (
        <Button onClick={() => doExport("excel")} variant="outline" size="sm" className="border-border gap-2 text-xs" disabled={loading === "excel"}>
          <FileSpreadsheet className="w-3 h-3 text-green-400" />{loading === "excel" ? "..." : "Excel"}
        </Button>
      )}
    </div>
  );
}
