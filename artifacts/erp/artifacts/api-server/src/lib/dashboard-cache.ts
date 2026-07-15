const dashboardCache = new Map<string, { expiresAt: number; value: unknown }>();

export function getCached<T>(key: string): T | null {
  const entry = dashboardCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    dashboardCache.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setCached<T>(key: string, value: T, ttlMs = 15000): T {
  dashboardCache.set(key, { expiresAt: Date.now() + ttlMs, value });
  return value;
}

export function clearCacheKey(key: string) {
  dashboardCache.delete(key);
}

export function clearCachePrefix(prefix: string) {
  for (const key of Array.from(dashboardCache.keys())) {
    if (key.startsWith(prefix)) dashboardCache.delete(key);
  }
}

export function clearAllCache() {
  dashboardCache.clear();
}

export default { getCached, setCached, clearCacheKey, clearCachePrefix, clearAllCache };
