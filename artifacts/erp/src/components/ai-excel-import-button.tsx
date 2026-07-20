import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet, Upload, CheckCircle2, AlertTriangle, Sparkles, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { BASE } from "@/lib/api";

type ImportKind = "sales" | "purchases" | "customers" | "suppliers" | "products";

type PreviewResponse = {
  kind: ImportKind;
  confidence: string;
  rowCount: number;
  mapping: Record<string, string | null>;
  sample: Record<string, string>[];
};

type ImportResponse = {
  kind: ImportKind;
  confidence: string;
  totalRows: number;
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
  message: string;
};

const KIND_LABEL: Record<ImportKind, string> = {
  sales: "Sales",
  purchases: "Purchases",
  customers: "Customers",
  suppliers: "Suppliers",
  products: "Products",
};

interface Props {
  /** Which tab this button lives on. Sent to the AI as a hint — it will still
   * re-classify if the actual sheet contents clearly don't match. */
  importType: ImportKind;
  /** Called after a successful import so the page can refetch its list. */
  onComplete?: () => void;
  /** Optional label override, defaults to "Import from Excel". */
  label?: string;
}

/**
 * Drop-in "Import from Excel" button for any tab (Sales, Purchases,
 * Customers, Suppliers, Products...). Accepts ANY Excel/CSV layout — the
 * person doesn't need to match a template. Flow:
 *   1. Pick file -> we send it to the backend in "preview" mode.
 *   2. AI reads the headers + a sample of rows, figures out what the sheet
 *      is and how its columns map to our fields, and shows a quick preview.
 *   3. Person confirms -> we re-send the same file to actually import every
 *      row, in order, into the right place (creating missing customers/
 *      suppliers/products as needed).
 */
export function AiExcelImportButton({ importType, onComplete, label }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"idle" | "analyzing" | "preview" | "importing" | "done">("idle");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStage("idle"); setPreview(null); setResult(null); setPendingFile(null); setError(null);
  };

  const analyze = async (file: File) => {
    setPendingFile(file);
    setError(null);
    setStage("analyzing");
    setOpen(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("importType", importType);
      formData.append("preview", "true");
      const res = await fetch(`${BASE}/api/import/ai/excel`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not analyze this file.");
      setPreview(data);
      setStage("preview");
    } catch (e: any) {
      setError(e?.message || "Something went wrong reading this file.");
      setStage("idle");
    }
  };

  const confirmImport = async () => {
    if (!pendingFile) return;
    setStage("importing");
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", pendingFile);
      formData.append("importType", importType);
      const res = await fetch(`${BASE}/api/import/ai/excel`, { method: "POST", body: formData });
      const data: ImportResponse = await res.json();
      if (!res.ok) throw new Error((data as any).error || "Import failed.");
      setResult(data);
      setStage("done");
      if (data.imported > 0) {
        toast({ title: `✅ Imported ${data.imported} ${KIND_LABEL[data.kind]}`, description: data.message });
        onComplete?.();
      } else {
        toast({ title: "Nothing imported", description: data.message, variant: "destructive" });
      }
    } catch (e: any) {
      setError(e?.message || "Import failed.");
      setStage("preview");
    }
  };

  const mappedCount = preview ? Object.values(preview.mapping).filter(Boolean).length : 0;
  const totalFields = preview ? Object.keys(preview.mapping).length : 0;

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept=".xlsx,.xls,.csv"
        onChange={e => { const f = e.target.files?.[0]; if (f) analyze(f); e.target.value = ""; }}
      />
      <Button
        variant="outline"
        onClick={() => fileRef.current?.click()}
        className="w-full gap-2 border-border sm:w-auto"
      >
        <Sheet className="h-4 w-4" /> {label || "Import from Excel"}
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> AI Excel Import — {KIND_LABEL[importType]}
            </DialogTitle>
            <DialogDescription>
              Upload any Excel or CSV file — column names and order don't need to match a template. AI will read it and map it automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {stage === "analyzing" && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-medium">AI is reading your file...</p>
                <p className="text-xs text-muted-foreground">Detecting columns and matching them to the right fields.</p>
              </div>
            )}

            {stage === "preview" && preview && (
              <div className="space-y-3">
                <div className="rounded-lg border border-border/60 bg-background/50 p-3 text-sm">
                  <p className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    Detected as <span className="text-primary">{KIND_LABEL[preview.kind]}</span>
                    <span className="text-xs text-muted-foreground">({preview.confidence} confidence)</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {preview.rowCount} rows found · {mappedCount}/{totalFields} fields matched
                  </p>
                </div>

                {preview.sample.length > 0 && (
                  <div className="max-h-48 overflow-auto rounded-lg border border-border/60">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-background/90">
                        <tr>
                          {Object.keys(preview.sample[0]).map(k => (
                            <th key={k} className="px-2 py-1.5 text-left font-medium text-muted-foreground">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.sample.map((row, i) => (
                          <tr key={i} className="border-t border-border/40">
                            {Object.values(row).map((v, j) => (
                              <td key={j} className="px-2 py-1.5 truncate max-w-[120px]">{v || <span className="text-muted-foreground">—</span>}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {preview.kind !== importType && (
                  <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-2.5 text-xs text-yellow-500">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>This looks like {KIND_LABEL[preview.kind]} data, not {KIND_LABEL[importType]}. It will still be imported into the correct place ({KIND_LABEL[preview.kind]}).</span>
                  </div>
                )}
              </div>
            )}

            {stage === "importing" && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-medium">Importing rows...</p>
                <p className="text-xs text-muted-foreground">Creating entries in order. This may take a moment for large files.</p>
              </div>
            )}

            {stage === "done" && result && (
              <div className="space-y-2">
                <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${result.imported > 0 ? "border-emerald-500/30 bg-emerald-500/5" : "border-yellow-500/30 bg-yellow-500/5"}`}>
                  {result.imported > 0 ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-500" />}
                  <span>{result.message}</span>
                </div>
                {result.errors.length > 0 && (
                  <div className="max-h-32 overflow-auto rounded-lg border border-red-500/20 bg-red-500/5 p-2 text-xs text-red-400 space-y-0.5">
                    {result.errors.slice(0, 10).map((e, i) => <p key={i}>{e}</p>)}
                    {result.errors.length > 10 && <p className="text-muted-foreground">+{result.errors.length - 10} more</p>}
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-2.5 text-xs text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" /> <span>{error}</span>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {stage === "preview" && (
              <>
                <Button variant="outline" onClick={() => setOpen(false)} className="border-border">Cancel</Button>
                <Button onClick={confirmImport} className="gap-2 bg-primary hover:bg-primary/90">
                  <Upload className="h-4 w-4" /> Import {preview?.rowCount} Rows
                </Button>
              </>
            )}
            {stage === "done" && (
              <Button onClick={() => setOpen(false)} className="bg-primary hover:bg-primary/90">Close</Button>
            )}
            {stage === "idle" && error && (
              <Button variant="outline" onClick={() => setOpen(false)} className="border-border">Close</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
