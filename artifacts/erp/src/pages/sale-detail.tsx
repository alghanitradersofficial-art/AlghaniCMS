import { useState } from "react";
import { useParams, Link } from "wouter";
import { useGetSale } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { PageLoading } from "@/components/loading-state";

export default function SaleDetail() {
  const params = useParams<{ id: string }>();
  const saleId = Number(params.id);
  const { data: sale, isLoading, error } = useGetSale(saleId);

  if (isLoading) {
    return (
      <Layout>
        <PageLoading label="Loading sale details" />
      </Layout>
    );
  }

  if (!sale || error) {
    return (
      <Layout>
        <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center">
          <p className="text-lg font-semibold">Sale not found</p>
          <p className="mt-2 text-sm text-muted-foreground">Please go back to the sales list.</p>
          <Link href="/sales">
            <Button className="mt-4">Back to Sales</Button>
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
            <Link href="/sales">
              <Button variant="ghost" className="gap-2"><ArrowLeft className="w-4 h-4" /> Back</Button>
            </Link>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">Sale {sale.invoiceNumber}</h1>
            <p className="text-sm text-muted-foreground">{sale.customerName} • Rs. {Number(sale.total).toLocaleString()}</p>
          </div>
          <Badge className={sale.status === "completed" ? "bg-emerald-500/10 text-emerald-500" : sale.status === "pending" ? "bg-yellow-500/10 text-yellow-500" : "bg-red-500/10 text-red-500"}>{sale.status}</Badge>
        </div>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Sale Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Invoice</div>
                <div className="mt-2 font-medium">{sale.invoiceNumber}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Date</div>
                <div className="mt-2 font-medium">{new Date(sale.createdAt).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Customer</div>
                <div className="mt-2 font-medium">{sale.customerName}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Total</div>
                <div className="mt-2 font-medium">Rs. {Number(sale.total).toLocaleString()}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
