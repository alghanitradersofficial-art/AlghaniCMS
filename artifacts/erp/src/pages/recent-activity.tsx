import { useState, useMemo } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useGetRecentActivity } from "@workspace/api-client-react";
import { apiPost, apiDelete } from "@/lib/api";
import { Link } from "wouter";
import { Trash, Activity } from "lucide-react";

type Act = { id: number; type: string; description: string; amount: number; createdAt: string; dismissed?: boolean };

export default function RecentActivity() {
  const recentQuery = useGetRecentActivity();
  const { data = [], isLoading } = recentQuery as any;
  const [tab, setTab] = useState<string>("all");
  const [dismissingIds, setDismissingIds] = useState<Record<string, boolean>>({});
  const [dismissedLocal, setDismissedLocal] = useState<Record<string, boolean>>({});

  const list: Act[] = (data as any) || [];

  const byType = useMemo(() => {
    const groups: Record<string, Act[]> = {};
    list.forEach((a) => {
      groups[a.type] = groups[a.type] || [];
      groups[a.type].push(a);
    });
    return groups;
  }, [list]);

  const isDismissed = (a: Act) => !!(a.dismissed || dismissedLocal[`${a.type}:${a.id}`]);
  const visible = list.filter((a) => !isDismissed(a) && (tab === "all" || a.type === tab));

  const types = ["all", ...Object.keys(byType)];
  const getTabCount = (type: string) => {
    if (type === "all") return list.filter((a) => !isDismissed(a)).length;
    return (byType[type] || []).filter((a) => !isDismissed(a)).length;
  };

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
              <Activity className="h-3.5 w-3.5" />
              Recent Activity
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">Recent Activity</h1>
            <p className="mt-1 text-sm text-muted-foreground">Recent events across sales, purchases and expenses.</p>
          </div>
          <div className="flex items-center gap-2" />
        </div>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Activity Stream</CardTitle>
            <div className="flex gap-2">
              {types.map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`px-3 py-1 rounded ${tab === t ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>
                  {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)} ({getTabCount(t)})
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground p-4">Loading…</div>
            ) : (
              <div className="space-y-2">
                {visible.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-4">No recent activity.</div>
                ) : (
                  visible.map((a: Act) => {
                    const key = `${a.type}:${a.id}`;
                    return (
                      <div key={key} className="flex items-center justify-between gap-3 rounded border border-border/40 p-3">
                        <div className="flex-1">
                          <div className="font-medium">{a.description}</div>
                          <div className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString()} • Rs. {Number(a.amount).toLocaleString()}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {a.type === "sale" && <Link href={`/sales/${a.id}`} className="text-sm text-primary">Open Sale</Link>}
                          {a.type === "purchase" && <Link href={`/purchases/${a.id}`} className="text-sm text-primary">Open Purchase</Link>}
                          {a.type === "expense" && <Link href={`/expenses/${a.id}`} className="text-sm text-primary">Open Expense</Link>}
                          <Button
                            variant="destructive"
                            size="sm"
                            className={`transform transition-all duration-150 ${dismissingIds[key] ? "opacity-70 scale-95 cursor-wait" : "hover:scale-105"}`}
                            disabled={!!dismissingIds[key]}
                            onClick={async () => {
                              if (!confirm('Permanently delete this record? This cannot be undone.')) return;
                              try {
                                setDismissingIds((s) => {
                                  const copy = { ...s };
                                  copy[key] = true;
                                  return copy;
                                });

                                // route to entity delete endpoints when possible
                                let deleted = false;
                                if (a.type === 'sale') {
                                  // use void flow for sales to avoid FK issues
                                  await apiPost(`/api/sales/${a.id}/void`, {});
                                  deleted = true;
                                } else if (a.type === 'purchase') {
                                  await apiDelete(`/api/purchases/${a.id}`);
                                  deleted = true;
                                } else if (a.type === 'expense') {
                                  await apiDelete(`/api/expenses/${a.id}`);
                                  deleted = true;
                                }

                                if (deleted) {
                                  // mark locally dismissed so counts update immediately
                                  setDismissedLocal((s) => {
                                    const copy = { ...s };
                                    copy[key] = true;
                                    return copy;
                                  });
                                } else {
                                  // fallback to previous dismiss behavior for unknown types
                                  await apiPost('/api/dashboard/recent-activity/dismiss', { type: a.type, id: a.id });
                                  setDismissedLocal((s) => {
                                    const copy = { ...s };
                                    copy[key] = true;
                                    return copy;
                                  });
                                }

                                ;(recentQuery as any).refetch();
                              } catch (error) {
                                console.error('Delete activity failed', error);
                              } finally {
                                setDismissingIds((s) => {
                                  const copy = { ...s };
                                  delete copy[key];
                                  return copy;
                                });
                              }
                            }}
                          >
                            {dismissingIds[key] ? (
                              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                              </svg>
                            ) : (
                              <Trash className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
