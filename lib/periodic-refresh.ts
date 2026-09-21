// Keeps the local Products/Stores/tax mirror from going stale while online
// -- a different concern from lib/sync-processor.ts's 15s queue-drain loop
// (that one pushes local writes OUT; this one pulls fresh server data IN).
// 60s to match siri-api's own response cache TTL (siri-api/cache.py) --
// there's no point pulling more often than the server itself refreshes,
// and this is the actual "background updates" mechanism for the pages that
// read from the local mirror (Products/Stores/Billing/Users) rather than
// api-cache.ts's per-endpoint cache (see hooks/useBackgroundPoll.ts for
// that side of it).
import {
  pullAllProducts,
  pullAllStores,
  pullTaxPercentage,
  pullAllCustomers,
  pullAllUsers,
  pullRecentBills,
} from "./resilient-client";

let refreshHandle: ReturnType<typeof setInterval> | null = null;
let refreshInFlight = false;

export function startPeriodicRefreshLoop(intervalMs = 60_000): () => void {
  if (typeof window === "undefined") return () => {};

  const run = async () => {
    if (refreshInFlight || !navigator.onLine) return;
    refreshInFlight = true;
    try {
      await Promise.all([
        pullAllProducts(),
        pullAllStores(),
        pullTaxPercentage(),
        pullAllCustomers(),
        pullAllUsers(),
        pullRecentBills(),
      ]);
    } finally {
      refreshInFlight = false;
    }
  };

  if (!refreshHandle) {
    refreshHandle = setInterval(run, intervalMs);
  }
  window.addEventListener("online", run);

  return () => {
    window.removeEventListener("online", run);
  };
}
