import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isLoggedIn } from "@/lib/auth";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Inventory from "@/pages/inventory";
import Categories from "@/pages/categories";
import Brands from "@/pages/brands";
import Sales from "@/pages/sales";
import Purchases from "@/pages/purchases";
import Customers from "@/pages/customers";
import Suppliers from "@/pages/suppliers";
import Expenses from "@/pages/expenses";
import Employees from "@/pages/employees";
import Users from "@/pages/users";
import StaffPage from "@/pages/staff";
import StaffDetail from "@/pages/staff-detail";
import SupplierDetail from "@/pages/supplier-detail";
import LedgerPage from "@/pages/ledger";
import CalendarPage from "@/pages/calendar";
import Reports from "@/pages/reports";
import Settings from "@/pages/settings";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } },
});

function AuthGuard({ component: Component }: { component: React.ComponentType }) {
  if (!isLoggedIn()) return <Redirect to="/login" />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/dashboard">{() => <AuthGuard component={Dashboard} />}</Route>
      <Route path="/inventory">{() => <AuthGuard component={Inventory} />}</Route>
      <Route path="/categories">{() => <AuthGuard component={Categories} />}</Route>
      <Route path="/brands">{() => <AuthGuard component={Brands} />}</Route>
      <Route path="/sales">{() => <AuthGuard component={Sales} />}</Route>
      <Route path="/purchases">{() => <AuthGuard component={Purchases} />}</Route>
      <Route path="/customers">{() => <AuthGuard component={Customers} />}</Route>
      <Route path="/suppliers">{() => <AuthGuard component={Suppliers} />}</Route>
      <Route path="/suppliers/:id">{() => <AuthGuard component={SupplierDetail} />}</Route>
      <Route path="/expenses">{() => <AuthGuard component={Expenses} />}</Route>
      <Route path="/employees">{() => <AuthGuard component={Employees} />}</Route>
      <Route path="/staff">{() => <AuthGuard component={StaffPage} />}</Route>
      <Route path="/staff/:id">{() => <AuthGuard component={StaffDetail} />}</Route>
      <Route path="/ledger">{() => <AuthGuard component={LedgerPage} />}</Route>
      <Route path="/calendar">{() => <AuthGuard component={CalendarPage} />}</Route>
      <Route path="/users">{() => <AuthGuard component={Users} />}</Route>
      <Route path="/reports">{() => <AuthGuard component={Reports} />}</Route>
      <Route path="/settings">{() => <AuthGuard component={Settings} />}</Route>
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
