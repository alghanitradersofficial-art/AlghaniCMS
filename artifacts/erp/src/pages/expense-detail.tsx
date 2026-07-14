import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { PageLoading } from "@/components/loading-state";

type Expense = {
  id: number;
  title: string;
  category: string;
  amount: number;
  date: string;
  notes?: string;
  createdAt: string;
};

function fetchExpense(expenseId: number) {
  return apiGet<Expense>(`/api/expenses/${expenseId}`);
}

export default function ExpenseDetail() {
  const params = useParams<{ id: string }>();
  const expenseId = Number(params.id);

  const { data: expense, isLoading, error } = useQuery({
    queryKey: ["expense", expenseId],
    queryFn: () => fetchExpense(expenseId),
    enabled: Number.isFinite(expenseId) && expenseId > 0,
    retry: 1,
  });

  if (isLoading) {
    return (
      <Layout>
        <PageLoading label="Loading expense details" />
      </Layout>
    );
  }

  if (!expense || error) {
    return (
      <Layout>
        <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center">
          <p className="text-lg font-semibold">Expense not found</p>
          <p className="mt-2 text-sm text-muted-foreground">Please go back to the expenses list.</p>
          <Link href="/expenses">
            <Button className="mt-4">Back to Expenses</Button>
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
            <Link href="/expenses">
              <Button variant="ghost" className="gap-2"><ArrowLeft className="w-4 h-4" /> Back</Button>
            </Link>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">Expense #{expense.id}</h1>
            <p className="text-sm text-muted-foreground">{expense.title} • Rs. {Number(expense.amount).toLocaleString()}</p>
          </div>
          <Badge className="bg-primary/10 text-primary">Expense</Badge>
        </div>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Expense Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Title</div>
                <div className="mt-2 font-medium">{expense.title}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Category</div>
                <div className="mt-2 font-medium">{expense.category}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Amount</div>
                <div className="mt-2 font-medium">Rs. {Number(expense.amount).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Date</div>
                <div className="mt-2 font-medium">{new Date(expense.date).toLocaleDateString()}</div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Notes</div>
                <div className="mt-2 text-sm text-muted-foreground">{expense.notes || "—"}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
