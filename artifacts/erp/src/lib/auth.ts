const TOKEN_KEY = "alghani_jwt";
const USER_KEY = "alghani_user";

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  permissions: string[];
};

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function setAuth(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export function hasPermission(permission: string): boolean {
  const user = getUser();
  if (!user) return false;
  if (user.role === "ceo" || user.role === "developer") return true;
  return user.permissions?.includes(permission) ?? false;
}

export function getAuthHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Points at the deployed API server. Set VITE_API_URL in your Vercel project
// (e.g. https://your-api.vercel.app). Empty string works for local dev when
// the frontend dev server proxies /api to the API server on the same origin.
const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export async function apiLogin(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Login failed" }));
    throw new Error(err.error || "Invalid credentials");
  }
  return res.json();
}
