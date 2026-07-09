import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isLoggedIn, hasPermission } from "@/lib/auth";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Inventory from "@/pages/inventory";
import Brands from "@/pages/brands";
import Sales from "@/pages/sales";
import Purchases from "@/pages/purchases";
import Customers from "@/pages/customers";
import Suppliers from "@/pages/suppliers";
import Expenses from "@/pages/expenses";
import Users from "@/pages/users";
import StaffPage from "@/pages/staff";
import StaffDetail from "@/pages/staff-detail";
import SupplierDetail from "@/pages/supplier-detail";
import LedgerPage from "@/pages/ledger";
import Reports from "@/pages/reports";
import Settings from "@/pages/settings";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } },
});

function AuthGuard({ component: Component, permission }: { component: React.ComponentType; permission?: string }) {
  if (!isLoggedIn()) return <Redirect to="/login" />;
  if (permission && !hasPermission(permission)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
        <div className="text-4xl mb-4">🔒</div>
        <h2 className="text-xl font-bold mb-2">Access Denied</h2>
        <p className="text-muted-foreground">You don't have permission to access this page.</p>
      </div>
    );
  }
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/dashboard">{() => <AuthGuard component={Dashboard} permission="dashboard" />}</Route>
      <Route path="/inventory">{() => <AuthGuard component={Inventory} permission="inventory" />}</Route>
      <Route path="/brands">{() => <AuthGuard component={Brands} permission="brands" />}</Route>
      <Route path="/sales">{() => <AuthGuard component={Sales} permission="sales" />}</Route>
      <Route path="/purchases">{() => <AuthGuard component={Purchases} permission="purchases" />}</Route>
      <Route path="/customers">{() => <AuthGuard component={Customers} permission="customers" />}</Route>
      <Route path="/suppliers">{() => <AuthGuard component={Suppliers} permission="suppliers" />}</Route>
      <Route path="/suppliers/:id">{() => <AuthGuard component={SupplierDetail} permission="suppliers" />}</Route>
      <Route path="/expenses">{() => <AuthGuard component={Expenses} permission="expenses" />}</Route>
      <Route path="/staff">{() => <AuthGuard component={StaffPage} permission="staff" />}</Route>
      <Route path="/staff/:id">{() => <AuthGuard component={StaffDetail} permission="staff" />}</Route>
      <Route path="/ledger">{() => <AuthGuard component={LedgerPage} permission="ledger" />}</Route>
      <Route path="/users">{() => <AuthGuard component={Users} permission="users" />}</Route>
      <Route path="/reports">{() => <AuthGuard component={Reports} permission="reports" />}</Route>
      <Route path="/settings">{() => <AuthGuard component={Settings} permission="settings" />}</Route>
      <Route path="/">{() => <Redirect to={isLoggedIn() ? "/dashboard" : "/login"} />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
