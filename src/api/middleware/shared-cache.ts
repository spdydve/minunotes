import { DEFAULT_SHARED_LINK_TTL_MS, sharedLinkCache } from '../shared/cache';

export async function cachedJson<T>(params: {
  key: string;
  token: string;
  ttlMs?: number;
  compute: () => Promise<T>;
}): Promise<T> {
  const cached = sharedLinkCache.get(params.key);
  if (cached !== null) return cached as T;
  const value = await params.compute();
  sharedLinkCache.set(params.key, value, params.ttlMs ?? DEFAULT_SHARED_LINK_TTL_MS, params.token);
  return value;
}

export function buildNoteCacheKey(token: string) {
  return `share:note:${token}`;
}

export function buildFolderCacheKey(token: string) {
  return `share:folder:${token}`;
}

export function buildResolverCacheKey(token: string, targets: string[]) {
  const sorted = [...targets].sort();
  return `share:resolve:${token}:${sorted.join('\u0000')}`;
}
