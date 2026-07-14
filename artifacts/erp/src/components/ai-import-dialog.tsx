import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Upload, Image, FileText, CheckCircle, XCircle, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

interface AiImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: string;
  onComplete?: () => void;
}

type ImportResult = {
  imported: number;
  total?: number;
  message: string;
  errors?: string[];
  preview?: unknown[];
};

export function AiImportDialog({ open, onOpenChange, defaultType = "products", onComplete }: AiImportDialogProps) {
  const { toast } = useToast();
  const [importType, setImportType] = useState(defaultType);
  const [mode, setMode] = useState<"image" | "document">("image");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const excelRef = useRef<HTMLInputElement>(null);

  const acceptedImageTypes = ".jpg,.jpeg,.png,.gif,.webp,.bmp,.tiff";
  const acceptedDocTypes = ".pdf,.txt,.csv,.xlsx,.xls,.docx,.doc,.json,.xml";

  const handleFile = async (file: File) => {
    if (!file) return;
    setLoading(true);
    setProgress(10);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("importType", importType);
      setProgress(30);

      const endpoint = mode === "image" ? "ai/image" : "ai/document";
      const res = await fetch(`${BASE}/api/import/${endpoint}`, { method: "POST", body: formData });
      setProgress(80);
      const data: ImportResult = await res.json();
      setProgress(100);

      if (!res.ok) throw new Error((data as { error?: string }).error || "Import failed");
      setResult(data);
      if (data.imported > 0) {
        toast({ title: `✅ Imported ${data.imported} ${importType}`, description: data.message });
        onComplete?.();
      }
    } catch (err: unknown) {
      toast({ title: "Import Failed", description: (err as Error).message, variant: "destructive" });
      setResult({ imported: 0, message: (err as Error).message });
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  const handleExcelImport = async (file: File) => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const endpoint = importType === "customers" ? "customers" : "products";
      const res = await fetch(`${BASE}/api/import/${endpoint}`, { method: "POST", body: formData });
      const data: ImportResult = await res.json();
      setResult(data);
      if (data.imported > 0) { toast({ title: `✅ Imported ${data.imported}` }); onComplete?.(); }
    } catch (err: unknown) {
      toast({ title: "Failed", description: (err as Error).message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    if (isImage) { setMode("image"); handleFile(file); }
    else { setMode("document"); handleFile(file); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />AI Smart Import
          </DialogTitle>
          <DialogDescription>
            Import data from images (JPG, PNG, WebP) or documents (PDF, Excel, Word, CSV, TXT)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Import Type</Label>
              <Select value={importType} onValueChange={setImportType}>
                <SelectTrigger className="bg-background/50 border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="products">Products / Inventory</SelectItem>
                  <SelectItem value="customers">Customers</SelectItem>
                  <SelectItem value="suppliers">Suppliers</SelectItem>
                  <SelectItem value="expenses">Expenses</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Source Mode</Label>
              <div className="flex gap-1 p-1 bg-background/50 border border-border rounded-md">
                <button onClick={() => setMode("image")} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium transition-colors ${mode === "image" ? "bg-primary text-white" : "text-muted-foreground hover:text-white"}`}>
                  <Image className="w-3 h-3" />Image
                </button>
                <button onClick={() => setMode("document")} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium transition-colors ${mode === "document" ? "bg-primary text-white" : "text-muted-foreground hover:text-white"}`}>
                  <FileText className="w-3 h-3" />Document
                </button>
              </div>
            </div>
          </div>

          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${dragOver ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 hover:bg-background/50"}`}
            onClick={() => fileRef.current?.click()}
          >
            {loading ? (
              <div className="space-y-3">
                <Sparkles className="w-10 h-10 mx-auto text-primary animate-pulse" />
                <p className="text-sm font-medium text-white">AI processing...</p>
                {progress > 0 && <Progress value={progress} className="h-1.5" />}
              </div>
            ) : (
              <>
                <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium text-white">Drop file here or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {mode === "image" ? "JPG, PNG, WEBP, GIF, BMP, TIFF" : "PDF, XLSX, XLS, DOCX, DOC, CSV, TXT"}
                </p>
                <p className="text-xs text-primary/70 mt-2">Groq AI extracts {importType} data automatically</p>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept={mode === "image" ? acceptedImageTypes : acceptedDocTypes}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
            />
          </div>

          {importType === "products" && (
            <div className="border-t border-border pt-3">
              <p className="text-xs text-muted-foreground mb-2 font-medium">Or import from Excel/CSV template:</p>
              <Button variant="outline" size="sm" className="border-border gap-2 text-xs w-full" onClick={() => excelRef.current?.click()}>
                <Upload className="w-3 h-3" />Import Excel / CSV
              </Button>
              <input ref={excelRef} type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={e => { const f = e.target.files?.[0]; if (f) handleExcelImport(f); e.target.value = ""; }} />
            </div>
          )}

          {result && (
            <div className={`p-3 rounded-lg border text-sm space-y-1 ${result.imported > 0 ? "bg-green-500/5 border-green-500/20" : "bg-yellow-500/5 border-yellow-500/20"}`}>
              <div className="flex items-center gap-2">
                {result.imported > 0 ? <CheckCircle className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-yellow-400" />}
                <span className="font-medium text-white">{result.message}</span>
              </div>
              {result.total && result.total > result.imported && (
                <p className="text-xs text-muted-foreground pl-6">{result.total - result.imported} records skipped</p>
              )}
              {result.errors && result.errors.length > 0 && (
                <div className="pl-6 text-xs text-red-400 space-y-0.5">
                  {result.errors.slice(0, 3).map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
