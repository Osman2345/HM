interface CacheEntry {
  expiresAt: number;
  hasValue: boolean;
  value?: unknown;
  promise?: Promise<unknown>;
}

const cache = new Map<string, CacheEntry>();
const maxEntries = 100;

export const getCached = <T>(key: string): T | undefined => {
  const entry = cache.get(key);
  if (!entry?.hasValue || entry.expiresAt <= Date.now()) {
    if (entry && !entry.promise) cache.delete(key);
    return undefined;
  }
  return entry.value as T;
};

export const loadCached = <T>(
  key: string,
  load: () => Promise<T>,
  ttlMs = 15000,
  forceRefresh = false,
): Promise<T> => {
  const existing = cache.get(key);
  if (existing?.promise) {
    return existing.promise as Promise<T>;
  }
  if (!forceRefresh && existing?.hasValue && existing.expiresAt > Date.now()) {
    return Promise.resolve(existing.value as T);
  }

  for (const [cachedKey, entry] of cache) {
    if (!entry.promise && entry.expiresAt <= Date.now()) {
      cache.delete(cachedKey);
    }
  }
  while (cache.size >= maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }

  const entry: CacheEntry = { expiresAt: 0, hasValue: false };
  const request = Promise.resolve()
    .then(load)
    .then((value) => {
      if (cache.get(key) === entry) {
        entry.value = value;
        entry.hasValue = true;
        entry.expiresAt = Date.now() + ttlMs;
        entry.promise = undefined;
      }
      return value;
    }, (error: unknown) => {
      if (cache.get(key) === entry) {
        cache.delete(key);
      }
      throw error;
    });

  entry.promise = request;
  cache.set(key, entry);
  return request;
};

export const invalidateCached = (prefix: string) => {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
};

export const clearQueryCache = () => cache.clear();
