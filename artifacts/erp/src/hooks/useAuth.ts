import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  isActive: boolean;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  });
  const [loading, setLoading] = useState(false);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  const hasPermission = useCallback((perm: string) => {
    if (!user) return false;
    if (['ceo', 'developer'].includes(user.role)) return true;
    return user.permissions.includes(perm);
  }, [user]);

  return { user, loading, login, logout, hasPermission, setUser };
}
