"use client"

interface ProductLoadingBarProps {
  isStreaming: boolean
  progress: number
  loaded: number
  total: number | null
  loadedPages: number
  error?: Error | null
  onRetry?: () => void
  isOfflineFallback?: boolean
}

/**
 * Plain, static progress indicator for the products page. No animation —
 * the bar fill jumps straight to the latest percentage and the loaded count
 * counts up as each new page lands.
 */
export function ProductLoadingBar({
  isStreaming,
  progress,
  loaded,
  total,
  loadedPages,
  error,
  onRetry,
  isOfflineFallback,
}: ProductLoadingBarProps) {
  if (isOfflineFallback) {
    return (
      <div className="w-full mb-3 rounded border border-blue-200 bg-blue-50 px-3 py-2" aria-live="polite">
        <div className="flex items-center justify-between text-xs text-blue-800">
          <span>
            Showing {loaded.toLocaleString()} products from the last sync — no connection right now.
          </span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="ml-3 shrink-0 rounded bg-blue-600 px-2 py-1 text-white hover:bg-blue-700"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    )
  }

  if (!isStreaming && progress >= 1 && loaded > 0) {
    return null
  }

  // !isStreaming with progress < 1 means the load loop already stopped
  // (its finally already ran) without finishing -- that's a failure, not
  // "still finalizing". Previously this state showed "Finalizing" forever
  // with no indication anything had gone wrong or any way to retry.
  const isStuck = !isStreaming && progress < 1

  if (isStuck) {
    return (
      <div className="w-full mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2" aria-live="polite">
        <div className="flex items-center justify-between text-xs text-amber-800">
          <span>
            Stopped after loading {loaded.toLocaleString()}
            {total ? ` of ${total.toLocaleString()}` : ""} products
            {error ? ` — ${error.message}` : ""}.
          </span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="ml-3 shrink-0 rounded bg-amber-600 px-2 py-1 text-white hover:bg-amber-700"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    )
  }

  const pct = Math.max(0, Math.min(100, progress * 100))

  return (
    <div className="w-full mb-3" aria-live="polite">
      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
        <span>
          {isStreaming ? "Loading products" : "Preparing products"}
          {loadedPages > 0 ? ` · page ${loadedPages}` : ""}
        </span>
        <span className="tabular-nums">
          {loaded.toLocaleString()}
          {total ? ` / ${total.toLocaleString()}` : ""}
        </span>
      </div>
      <div className="h-1.5 w-full bg-gray-100 rounded overflow-hidden">
        <div
          className="h-full bg-blue-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default ProductLoadingBar
