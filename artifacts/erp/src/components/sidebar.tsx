import {
  LayoutDashboard,
  Package,
  Briefcase,
  ShoppingCart,
  Truck,
  Users,
  UserSquare,
  Receipt,
  FileBarChart,
  LogOut,
  Settings2,
  HardHat,
  BookText,
  Users2,
  Zap,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { clearAuth, getUser, hasPermission } from "@/lib/auth";

export const MENU_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard", permission: "dashboard" },
  { icon: Package, label: "Inventory & Brands", href: "/inventory", permission: "inventory" },
  { icon: ShoppingCart, label: "Sales", href: "/sales", permission: "sales" },
  { icon: Truck, label: "Purchases", href: "/purchases", permission: "purchases" },
  { icon: Users, label: "Customers", href: "/customers", permission: "customers" },
  { icon: UserSquare, label: "Suppliers", href: "/suppliers", permission: "suppliers" },
  { icon: Receipt, label: "Expenses", href: "/expenses", permission: "expenses" },
  { icon: Zap, label: "Quick Entry", href: "/quick-entry", permission: "sales" },
  { icon: Package, label: "Operations", href: "/operations", permission: "inventory" },
  { icon: HardHat, label: "Staff", href: "/staff", permission: "staff" },
  { icon: FileBarChart, label: "Reports & Analytics", href: "/reports", permission: "reports" },
  { icon: Users2, label: "Users", href: "/users", permission: "users" },
  { icon: Settings2, label: "Settings", href: "/settings", permission: "settings" },
];

export function SidebarContent({ onItemClick }: { onItemClick?: () => void }) {
  const [location, setLocation] = useLocation();
  const user = getUser();

  const visibleItems = MENU_ITEMS.filter((item) => hasPermission(item.permission));

  const handleLogout = () => {
    clearAuth();
    setLocation("/login");
    onItemClick?.();
  };

  return (
    <div className="flex h-full flex-col bg-card/90 p-3 text-sm text-foreground backdrop-blur-xl shadow-inner">
      <div className="flex items-center justify-between gap-3 rounded-3xl border border-border/60 bg-background/90 px-4 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <img src="/logo.jpg" alt="Al Ghani" className="h-10 w-10 rounded-2xl object-cover" />
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">Al Ghani</div>
            <div className="text-xs text-muted-foreground/80">ERP HQ</div>
          </div>
        </div>
      </div>

      {user && (
        <div className="mt-4 rounded-3xl border border-border/60 bg-primary/5 p-4 shadow-sm">
          <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Signed in as</div>
          <div className="mt-2 text-sm font-semibold text-foreground">{user.name}</div>
          <div className="text-xs text-muted-foreground/80 capitalize">{user.role}</div>
        </div>
      )}

      <div className="mt-5 flex-1 overflow-y-auto pr-1">
        <nav className="space-y-2">
          {visibleItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} onClick={onItemClick}>
                <div
                  className={`group flex items-center gap-3 rounded-3xl border px-4 py-3 transition-all duration-300 ease-in-out ${
                    isActive
                      ? "border-primary/60 bg-primary/10 text-primary shadow-sm"
                      : "border-border/60 bg-background/80 text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
                  }`}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  <span className="truncate text-sm font-medium">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-4 rounded-3xl border border-border/60 bg-background/80 p-4 shadow-sm">
        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/60 bg-destructive/5 px-4 py-3 text-sm font-semibold text-destructive transition-all duration-300 hover:bg-destructive/10"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </div>
  );
}

export function Sidebar() {
  return <SidebarContent />;
}
