import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";

const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

type ExportType = "sales" | "purchases" | "inventory" | "expenses" | "customers" | "suppliers" | "report";

interface ExportButtonsProps {
  type: ExportType;
  invoiceId?: number;
  compact?: boolean;
  queryString?: string;
}

export function ExportButtons({ type, invoiceId, compact, queryString }: ExportButtonsProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const doExport = async () => {
    setLoading("excel");
    const query = queryString ? `?${queryString}` : "";
    const url = `${BASE}/api/export/${type}/excel${query}`;
    const filename = `alghani-${type}.xlsx`;

    try {
      const blob = await customFetch<Blob>(url, { responseType: "blob" });
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } finally {
      setTimeout(() => setLoading(null), 2000);
    }
  };

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
          {hasExcel && (
            <DropdownMenuItem onClick={doExport} className="gap-2 cursor-pointer hover:bg-accent text-sm">
              <FileSpreadsheet className="w-4 h-4 text-green-400" />Excel (.xlsx) {loading === "excel" && "..."}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="flex gap-2">
      {hasExcel && (
        <Button onClick={doExport} variant="outline" size="sm" className="border-border gap-2 text-xs" disabled={loading === "excel"}>
          <FileSpreadsheet className="w-3 h-3 text-green-400" />{loading === "excel" ? "..." : "Excel"}
        </Button>
      )}
    </div>
  );
}
