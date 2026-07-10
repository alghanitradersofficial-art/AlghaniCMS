import {
  LayoutDashboard, Package, Briefcase, ShoppingCart, Truck, Users,
  UserSquare, Receipt, FileBarChart, LogOut, Settings2, HardHat,
  BookText, Users2, Zap
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { clearAuth, getUser, hasPermission } from "@/lib/auth";

export const MENU_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard", permission: "dashboard" },
  { icon: Package, label: "Inventory", href: "/inventory", permission: "inventory" },
  { icon: Briefcase, label: "Brands", href: "/brands", permission: "brands" },
  { icon: ShoppingCart, label: "Sales", href: "/sales", permission: "sales" },
  { icon: Truck, label: "Purchase", href: "/purchases", permission: "purchases" },
  { icon: Users, label: "Customers", href: "/customers", permission: "customers" },
  { icon: UserSquare, label: "Suppliers", href: "/suppliers", permission: "suppliers" },
  { icon: Receipt, label: "Expenses", href: "/expenses", permission: "expenses" },
  { icon: Zap, label: "Quick Entry", href: "/quick-entry", permission: "sales" },
  { icon: Package, label: "Operations", href: "/operations", permission: "inventory" },
  { icon: HardHat, label: "Staff", href: "/staff", permission: "staff" },
  { icon: BookText, label: "Ledger", href: "/ledger", permission: "ledger" },
  { icon: FileBarChart, label: "Reports & Analytics", href: "/reports", permission: "reports" },
  { icon: Users2, label: "Users", href: "/users", permission: "users" },
  { icon: Settings2, label: "Settings", href: "/settings", permission: "settings" },
];

export function SidebarContent({ onItemClick }: { onItemClick?: () => void }) {
  const [location, setLocation] = useLocation();
  const user = getUser();

  const visibleItems = MENU_ITEMS.filter(item => hasPermission(item.permission));

  const handleLogout = () => {
    clearAuth();
    setLocation("/login");
    onItemClick?.();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="h-14 sm:h-16 flex items-center px-4 sm:px-6 border-b border-sidebar-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <img src="/logo.jpg" alt="Al Ghani" className="w-7 h-7 sm:w-8 sm:h-8 rounded flex-shrink-0" />
          <span className="font-bold text-white tracking-tight uppercase text-xs sm:text-sm">Al Ghani Traders</span>
        </div>
      </div>

      {user && (
        <div className="px-4 py-2.5 border-b border-sidebar-border bg-sidebar-accent/20 flex-shrink-0">
          <p className="text-xs font-semibold text-white truncate">{user.name}</p>
          <p className="text-xs text-muted-foreground/70 capitalize">{user.role}</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-3">
        <nav className="space-y-0.5 px-2 sm:px-3">
          {visibleItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} onClick={onItemClick}>
                <div
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors cursor-pointer text-sm font-medium min-h-[40px] ${
                    isActive
                      ? "bg-sidebar-primary text-white shadow-sm"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-white"
                  }`}
                >
                  <item.icon className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : ""}`} />
                  <span className="truncate leading-none">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-3 sm:p-4 border-t border-sidebar-border flex-shrink-0">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors text-sm font-medium text-sidebar-foreground/70 hover:bg-destructive/10 hover:text-destructive min-h-[40px]"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}

// Desktop sidebar wrapper — used inside the hidden md:flex aside in Layout
export function Sidebar() {
  return <SidebarContent />;
}
