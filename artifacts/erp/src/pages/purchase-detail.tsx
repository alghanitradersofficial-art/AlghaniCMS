import { useParams, Link } from "wouter";
import { useGetPurchase } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { PageLoading } from "@/components/loading-state";

export default function PurchaseDetail() {
  const params = useParams<{ id: string }>();
  const purchaseId = Number(params.id);
  const { data: purchase, isLoading, error } = useGetPurchase(purchaseId);

  if (isLoading) {
    return (
      <Layout>
        <PageLoading label="Loading purchase details" />
      </Layout>
    );
  }

  if (!purchase || error) {
    return (
      <Layout>
        <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center">
          <p className="text-lg font-semibold">Purchase not found</p>
          <p className="mt-2 text-sm text-muted-foreground">Please go back to the purchase list.</p>
          <Link href="/purchases">
            <Button className="mt-4">Back to Purchases</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <Link href="/purchases">
              <Button variant="ghost" className="gap-2"><ArrowLeft className="w-4 h-4" /> Back</Button>
            </Link>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">Purchase {purchase.poNumber}</h1>
            <p className="text-sm text-muted-foreground">{purchase.supplierName} • Rs. {Number(purchase.total).toLocaleString()}</p>
          </div>
          <Badge className={purchase.status === "received" ? "bg-emerald-500/10 text-emerald-500" : purchase.status === "pending" ? "bg-yellow-500/10 text-yellow-500" : "bg-red-500/10 text-red-500"}>{purchase.status}</Badge>
        </div>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Purchase Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">PO Number</div>
                <div className="mt-2 font-medium">{purchase.poNumber}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Date</div>
                <div className="mt-2 font-medium">{new Date(purchase.createdAt).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Supplier</div>
                <div className="mt-2 font-medium">{purchase.supplierName}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Total</div>
                <div className="mt-2 font-medium">Rs. {Number(purchase.total).toLocaleString()}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
