// Shared API base URL, matching the convention already used across pages
// (see src/lib/auth.ts).
export const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export async function apiFetch<T = any>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const apiGet = <T = any>(path: string) => apiFetch<T>(path);
export const apiPost = <T = any>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined });
export const apiPatch = <T = any>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined });
export const apiDelete = <T = any>(path: string) => apiFetch<T>(path, { method: "DELETE" });
