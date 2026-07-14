import { useLocation, Link } from 'wouter';
import { useAuth } from '../hooks/useAuth';
import {
  LayoutDashboard, Package, ShoppingCart, Truck, Users, Building2,
  Receipt, Zap, BarChart3, Lock, UserCog, LogOut, Menu, X, ChevronRight
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '../lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  perm?: string;
}

const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard, perm: 'dashboard' },
  { label: 'Inventory', href: '/inventory', icon: Package, perm: 'inventory' },
  { label: 'Sales', href: '/sales', icon: ShoppingCart, perm: 'sales' },
  { label: 'Purchases', href: '/purchases', icon: Truck, perm: 'purchases' },
  { label: 'Customers', href: '/customers', icon: Users, perm: 'customers' },
  { label: 'Suppliers', href: '/suppliers', icon: Building2, perm: 'suppliers' },
  { label: 'Expenses', href: '/expenses', icon: Receipt, perm: 'expenses' },
  { label: 'Quick Entry', href: '/quick-entry', icon: Zap, perm: 'quick-entry' },
  { label: 'Reports', href: '/reports', icon: BarChart3, perm: 'reports' },
  { label: 'Month Close', href: '/operations', icon: Lock, perm: 'operations' },
  { label: 'Users', href: '/users', icon: UserCog, perm: 'users' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, hasPermission } = useAuth();
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const visibleNav = NAV.filter(item => !item.perm || hasPermission(item.perm) || location === item.href);

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && <div className="fixed inset-0 z-20 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={cn(
        'fixed lg:static inset-y-0 left-0 z-30 w-64 flex flex-col bg-[#0f172a] transition-transform duration-300',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">AG</div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">Al Ghani Traders</p>
            <p className="text-slate-400 text-xs">ERP System</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {visibleNav.map(item => {
            const Icon = item.icon;
            const isActive = item.href === '/' ? location === '/' : location.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <a className={cn('sidebar-item', isActive && 'active')} onClick={() => setSidebarOpen(false)}>
                  <Icon size={16} />
                  <span>{item.label}</span>
                  {isActive && <ChevronRight size={14} className="ml-auto opacity-70" />}
                </a>
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="px-3 py-4 border-t border-white/10">
          <div className="flex items-center gap-3 px-3 py-2 mb-2 rounded-lg">
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{user?.name}</p>
              <p className="text-slate-400 text-xs capitalize">{user?.role}</p>
            </div>
          </div>
          <button onClick={logout} className="sidebar-item w-full text-red-400 hover:text-red-300 hover:bg-red-500/10">
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-4 lg:px-6 py-3 flex items-center gap-4">
          <button className="lg:hidden text-gray-500 hover:text-gray-700" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex-1" />
          <div className="text-sm text-gray-500">{new Date().toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
