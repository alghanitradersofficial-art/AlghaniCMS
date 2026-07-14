import { useEffect, useState } from 'react';
import { Route, Switch, useLocation, Redirect } from 'wouter';
import { useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Sales from './pages/Sales';
import Purchases from './pages/Purchases';
import Customers from './pages/Customers';
import CustomerLedger from './pages/CustomerLedger';
import Suppliers from './pages/Suppliers';
import SupplierLedger from './pages/SupplierLedger';
import Expenses from './pages/Expenses';
import QuickEntry from './pages/QuickEntry';
import Reports from './pages/Reports';
import Operations from './pages/Operations';
import Users from './pages/Users';
import NotFound from './pages/NotFound';

function PrivateRoute({ children, perm }: { children: React.ReactNode; perm?: string }) {
  const { user, hasPermission } = useAuth();
  const [, navigate] = useLocation();
  if (!user) return <Redirect to="/login" />;
  if (perm && !hasPermission(perm)) return <Redirect to="/" />;
  return <>{children}</>;
}

export default function App() {
  const { user } = useAuth();

  return (
    <Switch>
      <Route path="/login">{user ? <Redirect to="/" /> : <Login />}</Route>
      <Route path="/forgot-password"><ForgotPassword /></Route>
      <Route path="/">
        <PrivateRoute>
          <Layout>
            <Route path="/"><Dashboard /></Route>
            <Route path="/inventory"><PrivateRoute perm="inventory"><Inventory /></PrivateRoute></Route>
            <Route path="/sales"><PrivateRoute perm="sales"><Sales /></PrivateRoute></Route>
            <Route path="/purchases"><PrivateRoute perm="purchases"><Purchases /></PrivateRoute></Route>
            <Route path="/customers"><PrivateRoute perm="customers"><Customers /></PrivateRoute></Route>
            <Route path="/customers/:id/ledger"><PrivateRoute perm="customer-ledger"><CustomerLedger /></PrivateRoute></Route>
            <Route path="/suppliers"><PrivateRoute perm="suppliers"><Suppliers /></PrivateRoute></Route>
            <Route path="/suppliers/:id/ledger"><PrivateRoute perm="supplier-ledger"><SupplierLedger /></PrivateRoute></Route>
            <Route path="/expenses"><PrivateRoute perm="expenses"><Expenses /></PrivateRoute></Route>
            <Route path="/quick-entry"><PrivateRoute perm="quick-entry"><QuickEntry /></PrivateRoute></Route>
            <Route path="/reports"><PrivateRoute perm="reports"><Reports /></PrivateRoute></Route>
            <Route path="/operations"><PrivateRoute perm="operations"><Operations /></PrivateRoute></Route>
            <Route path="/users"><PrivateRoute perm="users"><Users /></PrivateRoute></Route>
          </Layout>
        </PrivateRoute>
      </Route>
      <Route><NotFound /></Route>
    </Switch>
  );
}
