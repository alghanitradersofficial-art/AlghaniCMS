import { ReactNode, useState } from "react";
import { motion } from "framer-motion";
import { SidebarContent } from "./sidebar";
import { Menu, X, Moon, SunMedium, LayoutDashboard, BarChart2, Users, Box } from "lucide-react";
import { useTheme } from "next-themes";
import { Link, useLocation } from "wouter";

interface LayoutProps {
  children: ReactNode;
}

const quickNav = [
  { href: "/dashboard", label: "Accounting", icon: LayoutDashboard },
  { href: "/reports", label: "Analytics", icon: BarChart2 },
  { href: "/staff", label: "Employees", icon: Users },
  { href: "/inventory", label: "Inventory", icon: Box },
];

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="group inline-flex items-center gap-2 rounded-2xl border border-border/80 bg-card/80 px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-all duration-300 ease-in-out hover:-translate-y-0.5 hover:border-primary/60 hover:bg-primary/10"
    >
      {isDark ? <SunMedium className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-700" />}
      <span>{isDark ? "Light Mode" : "Dark Mode"}</span>
    </button>
  );
}

export function Layout({ children }: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();

  return (
    <div className="flex min-h-screen bg-background text-foreground transition-all duration-300 ease-in-out">
      <aside className="hidden md:flex w-72 xl:w-80 bg-card/90 border-r border-border/70 backdrop-blur-xl shadow-inner h-screen flex-col sticky top-0 overflow-hidden">
        <SidebarContent />
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

      <main className="flex-1 flex flex-col min-w-0 pb-24 md:pb-0">
        <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur-xl transition-all duration-300 ease-in-out">
          <div className="mx-auto flex h-16 max-w-[1800px] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-card/90 text-foreground transition-all duration-300 ease-in-out hover:bg-primary/10"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="hidden md:flex items-center gap-3 rounded-full border border-border/60 bg-card/80 px-3 py-2 shadow-sm backdrop-blur-xl">
              {quickNav.map(({ href, label, icon: Icon }) => {
                const isActive = location === href || location.startsWith(href);
                return (
                  <Link key={href} href={href} className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-all duration-300 ${isActive ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:bg-primary/10 hover:text-primary"}`}>
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                );
              })}
            </div>

            <div className="ml-auto flex items-center gap-3">
              <div className="hidden md:flex items-center gap-2 rounded-2xl border border-border/60 bg-card/90 px-3 py-2 shadow-sm">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_18px_rgba(34,197,94,0.26)]" />
                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Live</span>
              </div>
              <ThemeToggle />
            </div>
          </div>
        </header>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mx-auto flex-1 max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </motion.div>

        <div className="fixed inset-x-0 bottom-0 z-30 md:hidden bg-background/95 border-t border-border/80 backdrop-blur-xl px-4 py-3">
          <nav className="mx-auto grid max-w-[900px] grid-cols-4 gap-2">
            {quickNav.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className="inline-flex flex-col items-center justify-center rounded-3xl border border-border/60 bg-card/90 px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground transition-all duration-300 hover:border-primary/40 hover:text-primary hover:shadow-sm">
                <Icon className="h-5 w-5" />
                {label.split(" ")[0]}
              </Link>
            ))}
          </nav>
        </div>
      </main>
    </div>
  );
}
