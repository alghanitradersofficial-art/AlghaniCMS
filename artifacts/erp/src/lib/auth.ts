const TOKEN_KEY = "alghani_jwt";
const USER_KEY = "alghani_user";

function normalizeApiBaseUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  return value.replace(/\/?$/, "").replace(/\/api$/, "");
}

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

// Uses the current origin by default so no localhost fallback is baked into the frontend.
const configuredBase = normalizeApiBaseUrl(import.meta.env.VITE_API_URL?.trim() || "");
const BASE = configuredBase;

export async function apiLogin(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
  const loginPath = BASE ? `${BASE}/api/auth/login` : "/api/auth/login";
  const res = await fetch(loginPath, {
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
