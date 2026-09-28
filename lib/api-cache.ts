// Generic read-through response cache for pages whose data doesn't need to
// be queryable/joinable locally (Discounts, Returns, Orders, Audit,
// Analytics, Attendance) -- it's enough to replay the last good JSON
// response when offline, rather than building a bespoke relational mirror
// per page the way Products/Stores/Bills/Customers/Users have (lib/
// resilient-client.ts). One reusable primitive instead of five schemas.
import { API_BASE } from "./api-base";
import { getDb, initializeSchema } from "./local-db";

export interface CachedFetchResult<T> {
  data: T;
  source: "network" | "cache";
  cachedAt?: string;
}

// Small helper for pages driving several fetchWithBackgroundRefresh calls
// in parallel: each endpoint reports its own "am I currently stale?" by
// key, and this collapses them into one boolean setState call (true if
// ANY of them is currently stuck showing cached data).
export function withResolvers(setState: (stale: boolean) => void) {
  const flags: Record<string, boolean> = {};
  return {
    set(key: string, stale: boolean) {
      flags[key] = stale;
      setState(Object.values(flags).some(Boolean));
    },
  };
}

// Shared, in-memory, cross-page "this was just fetched" cache. Lives at
// module scope so it survives page navigation within the same app session
// (unlike component state, which is destroyed on unmount) but not a full
// reload -- the SQLite cache below already handles that longer-lived case.
// Without this, navigating Dashboard -> Products -> Dashboard re-fetches
// everything from scratch every time even if you were on Dashboard 10
// seconds ago and nothing could plausibly have changed.
const FRESHNESS_WINDOW_MS = 45_000;
const freshCache = new Map<string, { data: unknown; ts: number }>();

/** Returns the cached value for `key` if it was stored within the last
 * FRESHNESS_WINDOW_MS, else undefined. `key` need not be a URL -- callers
 * with their own multi-request result (e.g. the fully-assembled products
 * list) can use any stable string. */
export function getFreshCache<T>(key: string): T | undefined {
  const entry = freshCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > FRESHNESS_WINDOW_MS) return undefined;
  return entry.data as T;
}

export function setFreshCache<T>(key: string, data: T): void {
  freshCache.set(key, { data, ts: Date.now() });
}

/** Call after a mutation (create/update/delete) so the next fetch for this
 * key bypasses the freshness window instead of handing back what's now
 * stale data -- e.g. after saving a store, invalidate "/api/stores" so the
 * edit is visible immediately rather than for up to 45s. */
export function invalidateFreshCache(key: string): void {
  freshCache.delete(key);
}

async function authedFetch(path: string): Promise<Response> {
  const token = typeof window !== "undefined" ? localStorage.getItem("adminToken") : null;
  return fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

export async function readCache<T>(cacheKey: string): Promise<{ data: T; cachedAt: string } | null> {
  try {
    const db = await getDb();
    const rows = await db.select<{ payload_json: string; cached_at: string }[]>(
      "SELECT payload_json, cached_at FROM api_read_cache WHERE cache_key = $1",
      [cacheKey]
    );
    if (rows.length === 0) return null;
    return { data: JSON.parse(rows[0].payload_json) as T, cachedAt: rows[0].cached_at };
  } catch {
    return null;
  }
}

export async function writeCache(cacheKey: string, data: unknown): Promise<void> {
  try {
    await initializeSchema();
    const db = await getDb();
    await db.execute(
      `INSERT INTO api_read_cache (cache_key, payload_json, cached_at) VALUES ($1, $2, $3)
       ON CONFLICT(cache_key) DO UPDATE SET payload_json = excluded.payload_json, cached_at = excluded.cached_at`,
      [cacheKey, JSON.stringify(data), new Date().toISOString()]
    );
  } catch {
    // Best-effort -- a failed cache write shouldn't break the caller, which
    // already has the live network data in hand regardless.
  }
}

// path is used as-is as the cache key, so identical path+query strings
// (e.g. the same filter/pagination combination) share a cache entry, and
// different ones (e.g. a different storeId filter) are cached independently.
export async function cachedFetch<T>(path: string): Promise<CachedFetchResult<T>> {
  try {
    const response = await authedFetch(path);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as T;
    void writeCache(path, data);
    return { data, source: "network" };
  } catch (err) {
    const cached = await readCache<T>(path);
    if (cached) {
      return { data: cached.data, source: "cache", cachedAt: cached.cachedAt };
    }
    throw err;
  }
}

// Stale-while-revalidate: paints instantly from whatever's cached (if
// anything), then always kicks off a network refresh in the background --
// so revisiting a page never shows a blank/spinner page while data that
// was already fetched once loads again.
//
// `onData` fires with source "cache" immediately (if there was anything
// cached) and again with source "network" once the background refresh
// lands -- callers should treat "network" as the authoritative, current
// value and just let it overwrite whatever "cache" painted a moment ago.
// If the background refresh fails AFTER cache already painted something,
// it fails silently (no onData call, no thrown error) rather than
// disrupting the page with an error state -- `onStale` fires instead so
// the caller can show a subtle "showing last-synced data" indicator if it
// wants one. If there was nothing cached, the network attempt is the only
// attempt and a failure rejects normally.
//
// Pairs with siri-api's own 60s response cache (see siri-api/cache.py): the
// network leg here is often answered from that server-side cache too, so
// the "background refresh" is usually cheap even when it does run.
export async function fetchWithBackgroundRefresh<T>(
  path: string,
  onData: (result: CachedFetchResult<T>) => void,
  onStale?: (err: unknown) => void
): Promise<void> {
  // Skip everything (SQLite read, network) if any page fetched this exact
  // endpoint within the last FRESHNESS_WINDOW_MS -- treated as authoritative
  // ("network" source) since it basically is, just reused instead of
  // re-requested.
  const fresh = getFreshCache<T>(path);
  if (fresh !== undefined) {
    onData({ data: fresh, source: "network" });
    return;
  }

  const cached = await readCache<T>(path);
  if (cached) {
    onData({ data: cached.data, source: "cache", cachedAt: cached.cachedAt });
  }

  try {
    const response = await authedFetch(path);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as T;
    void writeCache(path, data);
    setFreshCache(path, data);
    onData({ data, source: "network" });
  } catch (err) {
    if (!cached) throw err;
    onStale?.(err);
  }
}
