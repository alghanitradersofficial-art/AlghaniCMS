import { ReactNode, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SidebarContent } from "./sidebar";
import { Menu, X, Moon, SunMedium, LayoutDashboard, BarChart2, Package, ShoppingCart, Wallet, ReceiptText, MoreHorizontal, Plus, ChevronRight, PanelLeftClose, PanelLeftOpen, Truck, Users, Settings2, BookText } from "lucide-react";
import { useTheme } from "next-themes";
import { Link, useLocation } from "wouter";

interface LayoutProps {
  children: ReactNode;
}

const mobileNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/sales", label: "Sales", icon: ShoppingCart },
  { href: "/financial-periods", label: "Accounting", icon: Wallet },
  { href: "#more", label: "More", icon: MoreHorizontal },
];

const moreItems = [
  { href: "/purchases", label: "Purchases", icon: Truck },
  { href: "/customers", label: "Contacts", icon: Users },
  { href: "/reports", label: "Reports", icon: BarChart2 },
  { href: "/financial-periods", label: "Financial Periods", icon: Wallet },
  { href: "/staff", label: "Staff", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

const fabActions = [
  { href: "/sales", label: "New Sale", icon: ShoppingCart },
  { href: "/purchases", label: "New Purchase", icon: Truck },
  { href: "/sales", label: "Receive Payment", icon: Wallet },
  { href: "/expenses", label: "Add Expense", icon: ReceiptText },
  { href: "/customers", label: "Add Customer", icon: Users },
  { href: "/suppliers", label: "Add Supplier", icon: Users },
  { href: "/inventory", label: "Stock Adjustment", icon: Package },
];

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="inline-flex items-center gap-2 rounded-[20px] border border-border/80 bg-card/80 px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-all duration-300 ease-in-out hover:-translate-y-0.5 hover:border-primary/60 hover:bg-primary/10"
    >
      {isDark ? <SunMedium className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-700" />}
      <span>{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}

export function Layout({ children }: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showMoreSheet, setShowMoreSheet] = useState(false);
  const [showFabMenu, setShowFabMenu] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [location] = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("erp-sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("erp-sidebar-collapsed", collapsed ? "true" : "false");
    }
  }, [collapsed]);

  return (
    <div className="min-h-screen bg-transparent text-foreground transition-all duration-300 ease-in-out">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <aside className={`hidden md:flex ${collapsed ? "w-20" : "w-72 xl:w-80"} h-screen flex-col sticky top-0 overflow-hidden border-r border-border/70 bg-card/90 shadow-inner backdrop-blur-xl`}>
          <SidebarContent collapsed={collapsed} />
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
            <aside className="absolute left-0 top-0 bottom-0 w-72 bg-card/95 border-r border-border/70 shadow-2xl backdrop-blur-xl flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-4 border-b border-border/60">
                <div className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">Navigation</div>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border/60 text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <SidebarContent onItemClick={() => setMobileOpen(false)} />
            </aside>
          </div>
        )}

        <main className="flex-1 flex flex-col min-w-0 pb-28 md:pb-6">
          <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur-xl transition-all duration-300 ease-in-out">
            <div className="mx-auto flex h-16 max-w-[1800px] items-center gap-3 px-4 sm:px-6 lg:px-8">
              <button
                onClick={() => setMobileOpen(true)}
                className="md:hidden inline-flex h-11 w-11 items-center justify-center rounded-[20px] border border-border/70 bg-card/90 text-foreground transition-all duration-300 ease-in-out hover:bg-primary/10"
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5" />
              </button>

              <div className="hidden md:flex items-center gap-2 rounded-[999px] border border-border/60 bg-card/80 px-2 py-2 shadow-sm backdrop-blur-xl">
                <button
                  type="button"
                  onClick={() => setCollapsed((value) => !value)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                  aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                  {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </button>
                <div className="rounded-full bg-primary/10 px-3 py-2 text-sm font-semibold text-primary">Al Ghani ERP</div>
              </div>

              <div className="ml-auto flex items-center gap-3">
                <div className="hidden md:flex items-center gap-2 rounded-[20px] border border-border/60 bg-card/90 px-3 py-2 shadow-sm">
                  <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_18px_rgba(34,197,94,0.26)]" />
                  <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Live</span>
                </div>
                <ThemeToggle />
              </div>
            </div>
          </header>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="mx-auto flex-1 max-w-[1800px] px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
            {children}
          </motion.div>

          <div className="fixed inset-x-0 bottom-0 z-30 md:hidden border-t border-border/80 bg-background/95 px-3 py-3 backdrop-blur-xl">
            <nav className="mx-auto grid max-w-[900px] grid-cols-5 gap-2">
              {mobileNavItems.map(({ href, label, icon: Icon }) => {
                const isActive = href !== "#more" && (location === href || location.startsWith(href));
                if (href === "#more") {
                  return (
                    <button key={href} type="button" onClick={() => setShowMoreSheet(true)} className="inline-flex flex-col items-center justify-center rounded-[22px] border border-border/60 bg-card/90 px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground transition-all duration-300 hover:border-primary/40 hover:text-primary hover:shadow-sm">
                      <Icon className="h-5 w-5" />
                      {label}
                    </button>
                  );
                }

                return (
                  <Link key={href} href={href} className={`inline-flex flex-col items-center justify-center rounded-[22px] border px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] transition-all duration-300 ${isActive ? "border-primary/40 bg-primary/10 text-primary shadow-sm" : "border-border/60 bg-card/90 text-muted-foreground hover:border-primary/40 hover:text-primary hover:shadow-sm"}`}>
                    <Icon className="h-5 w-5" />
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <button
            type="button"
            onClick={() => setShowFabMenu((value) => !value)}
            className="fixed bottom-24 right-4 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_20px_45px_rgba(0,0,0,0.22)] transition-all duration-300 hover:scale-105 md:bottom-6"
            aria-label="Open quick actions"
          >
            <Plus className="h-6 w-6" />
          </button>

          <AnimatePresence>
            {showFabMenu && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-35 bg-slate-950/25 backdrop-blur-sm" onClick={() => setShowFabMenu(false)}>
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute bottom-36 right-4 w-[290px] rounded-[28px] border border-border/70 bg-card/95 p-3 shadow-2xl backdrop-blur-xl" onClick={(event) => event.stopPropagation()}>
                  <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Quick Actions</div>
                  <div className="grid gap-2">
                    {fabActions.map(({ href, label, icon: Icon }) => (
                      <Link key={label} href={href} onClick={() => setShowFabMenu(false)} className="flex items-center justify-between rounded-[20px] border border-border/60 bg-background/80 px-3 py-3 text-sm font-medium text-foreground transition hover:border-primary/40 hover:bg-primary/5">
                        <span className="flex items-center gap-3">
                          <span className="rounded-2xl bg-primary/10 p-2 text-primary">
                            <Icon className="h-4 w-4" />
                          </span>
                          {label}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    ))}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showMoreSheet && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-sm" onClick={() => setShowMoreSheet(false)}>
                <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute inset-x-0 bottom-0 rounded-t-[32px] border border-border/70 bg-card/95 p-4 shadow-2xl backdrop-blur-xl" onClick={(event) => event.stopPropagation()}>
                  <div className="mx-auto flex max-w-2xl flex-col gap-3">
                    <div className="flex items-center justify-between px-1">
                      <div>
                        <div className="text-lg font-semibold">More modules</div>
                        <div className="text-sm text-muted-foreground">Jump to the tools you use most.</div>
                      </div>
                      <button type="button" onClick={() => setShowMoreSheet(false)} className="rounded-full border border-border/60 p-2 text-muted-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {moreItems.map(({ href, label, icon: Icon }) => (
                        <Link key={href} href={href} onClick={() => setShowMoreSheet(false)} className="flex items-center justify-between rounded-[22px] border border-border/60 bg-background/80 px-3 py-3 text-sm font-medium text-foreground transition hover:border-primary/40 hover:bg-primary/5">
                          <span className="flex items-center gap-3">
                            <span className="rounded-2xl bg-primary/10 p-2 text-primary">
                              <Icon className="h-4 w-4" />
                            </span>
                            {label}
                          </span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </Link>
                      ))}
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
