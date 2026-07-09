import { ReactNode, useState } from "react";
import { SidebarContent } from "./sidebar";
import { Menu, X } from "lucide-react";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background text-foreground dark">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 lg:w-64 bg-sidebar border-r border-sidebar-border h-screen flex-col flex-shrink-0 sticky top-0 overflow-hidden">
        <SidebarContent />
      </aside>

      {/* Mobile overlay sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          {/* Drawer */}
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden shadow-2xl">
            <div className="absolute right-3 top-3 z-10">
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-md text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <SidebarContent onItemClick={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 sm:h-16 border-b border-border bg-card/50 backdrop-blur flex items-center px-4 sm:px-8 sticky top-0 z-10 gap-3">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors h-10 w-10 flex items-center justify-center flex-shrink-0"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex-1 flex items-center justify-between min-w-0">
            <div className="font-medium text-muted-foreground uppercase tracking-widest text-xs truncate hidden sm:block">
              ERP Command Center
            </div>
            <div className="font-bold text-white text-sm sm:hidden truncate">Al Ghani ERP</div>
            <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" />
                <span className="text-xs text-muted-foreground hidden sm:inline">System Online</span>
              </div>
            </div>
          </div>
        </header>

        <div className="p-4 sm:p-6 lg:p-8 flex-1 overflow-x-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}
