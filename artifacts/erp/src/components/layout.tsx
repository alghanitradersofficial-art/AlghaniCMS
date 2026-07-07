import { ReactNode } from "react";
import { Sidebar } from "./sidebar";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="flex min-h-screen bg-background text-foreground dark">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur flex items-center px-8 sticky top-0 z-10 justify-between">
          <div className="font-medium text-muted-foreground uppercase tracking-widest text-xs">
            ERP Command Center
          </div>
          <div className="flex items-center gap-4">
            <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" />
            <span className="text-xs text-muted-foreground">System Online</span>
          </div>
        </header>
        <div className="p-8 flex-1 overflow-x-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}
