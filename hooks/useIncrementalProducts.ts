"use client"

import { API_BASE } from "@/lib/api-base"
import { useCallback, useEffect, useRef, useState } from "react"
import type { Product as ProductType } from "@/lib/types"
import { getLocalProducts, type LocalProduct } from "@/lib/resilient-client"

// The local mirror only stores what lib/local-db.ts's products table has --
// no createdAt/updatedAt/batchid. synced_at (when this row was last pulled)
// stands in for both timestamps rather than leaving them blank; this is a
// deliberately partial view for the offline fallback, not the full record.
function localProductToProductType(p: LocalProduct & { global_stock?: number | null; synced_at?: string }): ProductType {
  const asOf = p.synced_at ?? new Date(0).toISOString()
  return {
    id: p.id,
    name: p.name,
    price: p.price ?? 0,
    barcode: p.barcode ?? undefined,
    stock: p.global_stock ?? p.stock ?? 0,
    globalStock: p.global_stock ?? undefined,
    sellingPrice: p.selling_price ?? undefined,
    createdAt: asOf,
    updatedAt: asOf,
    tax: p.tax ?? undefined,
    hsnCodeId: p.hsn_code_id ?? undefined,
  }
}

type Updater<T> = T | ((prev: T) => T)

type MutateOptions = boolean | { revalidate?: boolean }

export interface IncrementalProductsResult {
  data: ProductType[]
  error: Error | null
  isLoading: boolean
  isStreaming: boolean
  loadedPages: number
  totalCount: number | null
  progress: number
  isOfflineFallback: boolean
  mutate: (
    updater?: Updater<ProductType[]> | undefined,
    options?: MutateOptions,
  ) => Promise<ProductType[]>
}

interface PageResponse {
  data: ProductType[]
  page: number
  pageSize: number
  total: number | null
  hasMore: boolean
}

const DEFAULT_PAGE_SIZE = 200
const SAFETY_PAGE_CAP = 500
// After the first page lands we know the total, so we can fan out the
// remaining page requests in parallel. Kept low (not the old 8) because
// the backend only runs 8 worker slots total (2 gunicorn workers x 4
// threads) shared across every user and every other page -- firing 8
// products pages at once could alone fill every slot and starve
// everything else (bills, heartbeat, other tabs) until they all time out.
const PARALLEL_FETCH_CONCURRENCY = 2
// A page can fail transiently (cold cache computation, brief DB hiccup)
// without the whole catalog needing to fail -- retry a few times with a
// short backoff before giving up on that page.
const PAGE_RETRY_ATTEMPTS = 3
const PAGE_RETRY_DELAY_MS = 1000

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function shouldRevalidate(options?: MutateOptions): boolean {
  if (options === undefined) return true
  if (typeof options === "boolean") return options
  return options.revalidate !== false
}

// A page can hang instead of erroring (e.g. a cold aggregation cache on the
// server doing a slow first-time computation under real production-scale
// data) -- with no timeout, fetch() just waits forever, the progress bar
// gets stuck at "Finalizing" with no error and no way to know why. This
// turns a silent hang into a real, catchable, retryable failure.
const PAGE_FETCH_TIMEOUT_MS = 30000

async function fetchProductsPage(
  baseUrl: string,
  page: number,
  pageSize: number,
): Promise<PageResponse> {
  const url = `${baseUrl}/api/products/page?page=${page}&page_size=${pageSize}`
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), PAGE_FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`Failed to load products page ${page} (${response.status})`)
    }
    return (await response.json()) as PageResponse
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Timed out loading products page ${page} after ${PAGE_FETCH_TIMEOUT_MS / 1000}s`)
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

// Wraps fetchProductsPage with a few retries -- a page can fail from a
// transient backend hiccup (worker slots briefly all busy, cold cache
// computation) without the rest of the catalog needing to fail with it.
// Previously a single failed page meant those products just never showed
// up, with no retry and often no visible error either.
async function fetchProductsPageWithRetry(
  baseUrl: string,
  page: number,
  pageSize: number,
): Promise<PageResponse> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= PAGE_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await fetchProductsPage(baseUrl, page, pageSize)
    } catch (err) {
      lastErr = err
      if (attempt < PAGE_RETRY_ATTEMPTS) {
        await delay(PAGE_RETRY_DELAY_MS * attempt)
      }
    }
  }
  throw lastErr
}

export function useIncrementalProducts(pageSize: number = DEFAULT_PAGE_SIZE): IncrementalProductsResult {
  const [data, setData] = useState<ProductType[]>([])
  const [error, setError] = useState<Error | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isStreaming, setIsStreaming] = useState(false)
  const [loadedPages, setLoadedPages] = useState(0)
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [isOfflineFallback, setIsOfflineFallback] = useState(false)

  const fetchVersionRef = useRef(0)
  const isMountedRef = useRef(false)

  const fetchAll = useCallback(async (): Promise<ProductType[]> => {
    const myVersion = ++fetchVersionRef.current
    setError(null)
    setIsLoading(true)
    setIsStreaming(true)
    setLoadedPages(0)
    setTotalCount(null)
    setIsOfflineFallback(false)

    const baseUrl = API_BASE
    const pageBuckets: ProductType[][] = []
    let firstPageApplied = false
    let pagesCompleted = 0

    const applyPage = (pageNumber: number, items: ProductType[]) => {
      pageBuckets[pageNumber - 1] = items
      pagesCompleted += 1
      if (fetchVersionRef.current !== myVersion) return
      // Always flatten in page order so newest-first ordering is preserved
      // even when pages arrive out of order from parallel fetches.
      const flat: ProductType[] = []
      for (const bucket of pageBuckets) {
        if (bucket) flat.push(...bucket)
      }
      setData(flat)
      setLoadedPages(pagesCompleted)
      if (!firstPageApplied) {
        firstPageApplied = true
        setIsLoading(false)
      }
    }

    // Instant paint from the local mirror (kept fresh in the background by
    // lib/periodic-refresh.ts) while page 1 loads over the network -- only
    // takes effect if it resolves before page 1 does, and doesn't set the
    // offline-fallback flag since this isn't a failure, just a head start.
    getLocalProducts()
      .then((localProducts) => {
        if (fetchVersionRef.current !== myVersion || firstPageApplied || localProducts.length === 0) return
        setData(localProducts.map(localProductToProductType))
        setIsLoading(false)
      })
      .catch(() => {})

    try {
      // Step 1: fetch page 1 to learn `total` and `hasMore`.
      const firstPayload = await fetchProductsPageWithRetry(baseUrl, 1, pageSize)
      if (fetchVersionRef.current !== myVersion) return []
      const firstItems = Array.isArray(firstPayload.data) ? firstPayload.data : []
      if (typeof firstPayload.total === "number") {
        setTotalCount(firstPayload.total)
      }
      applyPage(1, firstItems)

      const hasMoreInitial = Boolean(firstPayload.hasMore) && firstItems.length > 0
      if (!hasMoreInitial) {
        return firstItems
      }

      // Step 2: determine the remaining page count.
      let totalPages: number | null = null
      if (typeof firstPayload.total === "number" && firstPayload.total > 0) {
        totalPages = Math.min(SAFETY_PAGE_CAP, Math.ceil(firstPayload.total / pageSize))
      }

      // Step 3: fan out remaining pages with capped concurrency. When the
      // server didn't return a total we fall back to sequential probing.
      if (totalPages !== null) {
        const remaining: number[] = []
        for (let p = 2; p <= totalPages; p += 1) remaining.push(p)

        const inFlight: Promise<void>[] = []
        let cursor = 0
        const next = async (): Promise<void> => {
          while (cursor < remaining.length) {
            if (fetchVersionRef.current !== myVersion) return
            const pageNumber = remaining[cursor++]
            const payload = await fetchProductsPageWithRetry(baseUrl, pageNumber, pageSize)
            if (fetchVersionRef.current !== myVersion) return
            const items = Array.isArray(payload.data) ? payload.data : []
            applyPage(pageNumber, items)
          }
        }
        const workerCount = Math.min(PARALLEL_FETCH_CONCURRENCY, remaining.length)
        for (let i = 0; i < workerCount; i += 1) inFlight.push(next())
        await Promise.all(inFlight)
      } else {
        // Sequential fallback when total is unknown.
        let page = 2
        let hasMore: boolean = hasMoreInitial
        while (hasMore && page <= SAFETY_PAGE_CAP) {
          if (fetchVersionRef.current !== myVersion) return []
          const payload = await fetchProductsPageWithRetry(baseUrl, page, pageSize)
          if (fetchVersionRef.current !== myVersion) return []
          const items = Array.isArray(payload.data) ? payload.data : []
          applyPage(page, items)
          hasMore = Boolean(payload.hasMore) && items.length > 0
          page += 1
        }
      }

      const final: ProductType[] = []
      for (const bucket of pageBuckets) if (bucket) final.push(...bucket)
      return final
    } catch (err) {
      const fallback: ProductType[] = []
      for (const bucket of pageBuckets) if (bucket) fallback.push(...bucket)

      // Nothing at all loaded (not even page 1) -- this is the "genuinely
      // offline" case, not a mid-stream hiccup after partial success. Fall
      // back to the local mirror (kept fresh in the background by
      // lib/periodic-refresh.ts) instead of leaving the page blank.
      if (fallback.length === 0) {
        try {
          const localProducts = await getLocalProducts()
          if (fetchVersionRef.current === myVersion && localProducts.length > 0) {
            const mapped = localProducts.map(localProductToProductType)
            setData(mapped)
            setIsOfflineFallback(true)
            setTotalCount(mapped.length)
            return mapped
          }
        } catch {
          // No local mirror available either (e.g. not running in Tauri) --
          // fall through to the normal error path below.
        }
      }

      if (fetchVersionRef.current === myVersion) {
        setError(err as Error)
      }
      return fallback
    } finally {
      if (fetchVersionRef.current === myVersion) {
        setIsLoading(false)
        setIsStreaming(false)
      }
    }
  }, [pageSize])

  useEffect(() => {
    isMountedRef.current = true
    fetchAll().catch(() => {})
    return () => {
      isMountedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const mutate = useCallback(
    async (updater?: Updater<ProductType[]>, options?: MutateOptions) => {
      if (updater !== undefined) {
        if (typeof updater === "function") {
          setData((prev) => {
            const next = (updater as (prev: ProductType[]) => ProductType[])(prev)
            return Array.isArray(next) ? next : prev
          })
        } else if (Array.isArray(updater)) {
          setData(updater)
        }
      }
      if (shouldRevalidate(options)) {
        return fetchAll()
      }
      return data
    },
    [fetchAll, data],
  )

  const progress = totalCount && totalCount > 0
    ? Math.min(1, data.length / totalCount)
    : isStreaming
      ? Math.min(0.95, loadedPages * 0.15)
      : data.length > 0
        ? 1
        : 0

  return {
    data,
    error,
    isLoading,
    isStreaming,
    loadedPages,
    totalCount,
    progress,
    isOfflineFallback,
    mutate,
  }
}
