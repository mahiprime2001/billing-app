// Orchestrates what happens once we know someone is logged in: pull fresh
// Products/Stores/tax data into the local mirror, then start the two
// ongoing background loops (queue-drain + periodic refresh). Called from
// components/AppProviders.tsx -- see lib/auth-events.ts for how it knows
// when to run.
import {
  pullAllProducts,
  pullAllStores,
  pullTaxPercentage,
  pullAllCustomers,
  pullAllUsers,
  pullRecentBills,
} from "./resilient-client";
import { startSyncQueueLoop } from "./sync-processor";
import { startPeriodicRefreshLoop } from "./periodic-refresh";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runInitialSync(reason: "mount" | "login-event"): Promise<void> {
  console.log(`[initial sync] starting (reason: ${reason})`);
  // Sequential, not Promise.all -- this used to fire all 6 pulls at the
  // exact same instant, right as the Billing page (if that's where login
  // lands) fires ~6 MORE requests of its own on mount. Together that's a
  // dozen-ish simultaneous requests against a backend with only 8 worker
  // slots total, shared with every other open tab and every store's POS --
  // some inevitably queue up, hit a client-side timeout, and abort ("Request
  // aborted" / "Failed to fetch" in the console, CORS-looking errors that
  // are really just a timed-out response with no headers). None of these
  // pulls need to race each other; a small gap between them costs a couple
  // seconds of background sync time in exchange for not adding to that pile.
  const pulls = [pullAllProducts, pullAllStores, pullTaxPercentage, pullAllCustomers, pullAllUsers, pullRecentBills];
  for (let i = 0; i < pulls.length; i += 1) {
    await pulls[i]();
    if (i < pulls.length - 1) await delay(300);
  }
  startSyncQueueLoop();
  startPeriodicRefreshLoop();
  console.log(`[initial sync] complete (reason: ${reason})`);
}
