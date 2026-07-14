import { getAuthHeaders } from "./auth";

export function normalizeApiBaseUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  return value.replace(/\/+$/, "").replace(/\/api$/, "");
}

const configuredBase = normalizeApiBaseUrl(import.meta.env.VITE_API_URL?.trim() || "");
const devFallback = import.meta.env.DEV ? "http://localhost:3001" : "";
export const BASE = configuredBase || devFallback;

function resolveApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!BASE) return normalizedPath;
  if (BASE.endsWith("/api") && normalizedPath.startsWith("/api")) {
    return `${BASE}${normalizedPath.slice(4)}`;
  }
  return `${BASE}${normalizedPath}`;
}

export async function apiFetch<T = any>(path: string, options?: RequestInit): Promise<T> {
  const headers = { "Content-Type": "application/json", ...(getAuthHeaders() || {}), ...(options?.headers || {}) };
  const res = await fetch(resolveApiUrl(path), { ...options, headers });
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
