import { LayoutDashboard, Package, Tags, Briefcase, ShoppingCart, Truck, Users, UserSquare, Receipt, Users2, IdCard, FileBarChart, LogOut, Settings2, Bell } from "lucide-react";
import { Link, useLocation } from "wouter";
import { clearAuth, getUser } from "@/lib/auth";

export function Sidebar() {
  const [location, setLocation] = useLocation();
  const user = getUser();

  const menuItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
    { icon: Package, label: "Inventory", href: "/inventory" },
    { icon: Tags, label: "Categories", href: "/categories" },
    { icon: Briefcase, label: "Brands", href: "/brands" },
    { icon: ShoppingCart, label: "Sales", href: "/sales" },
    { icon: Truck, label: "Purchases", href: "/purchases" },
    { icon: Users, label: "Customers", href: "/customers" },
    { icon: UserSquare, label: "Suppliers", href: "/suppliers" },
    { icon: Receipt, label: "Expenses", href: "/expenses" },
    { icon: IdCard, label: "Employees", href: "/employees" },
    { icon: Users2, label: "Users", href: "/users" },
    { icon: FileBarChart, label: "Reports", href: "/reports" },
    { icon: Settings2, label: "Settings", href: "/settings" },
  ];

  const handleLogout = () => {
    clearAuth();
    setLocation("/login");
  };

  return (
    <aside className="w-64 bg-sidebar border-r border-sidebar-border h-screen flex flex-col flex-shrink-0 sticky top-0">
      <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <img src="/logo.jpg" alt="Al Ghani Traders" className="w-8 h-8 rounded" />
          <span className="font-bold text-white tracking-tight uppercase text-sm">Al Ghani Traders</span>
        </div>
      </div>

      {user && (
        <div className="px-4 py-3 border-b border-sidebar-border bg-sidebar-accent/20">
          <p className="text-xs font-semibold text-white truncate">{user.name}</p>
          <p className="text-xs text-muted-foreground/70 capitalize">{user.role}</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-0.5 px-3">
          {menuItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}>
                <div className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer text-sm font-medium ${isActive ? "bg-sidebar-primary text-white shadow-sm" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-white"}`}>
                  <item.icon className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : ""}`} />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-sidebar-border space-y-1">
        <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer text-sm font-medium text-sidebar-foreground/70 hover:bg-destructive/10 hover:text-destructive">
          <LogOut className="w-4 h-4" />Logout
        </button>
      </div>
    </aside>
  );
}
