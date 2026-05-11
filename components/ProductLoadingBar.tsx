"use client"

interface ProductLoadingBarProps {
  isStreaming: boolean
  progress: number
  loaded: number
  total: number | null
  loadedPages: number
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
}: ProductLoadingBarProps) {
  if (!isStreaming && progress >= 1 && loaded > 0) {
    return null
  }

  const pct = Math.max(0, Math.min(100, progress * 100))

  return (
    <div className="w-full mb-3" aria-live="polite">
      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
        <span>
          {isStreaming ? "Loading products" : loaded === 0 ? "Preparing products" : "Finalizing"}
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
