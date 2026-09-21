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

export async function runInitialSync(reason: "mount" | "login-event"): Promise<void> {
  console.log(`[initial sync] starting (reason: ${reason})`);
  await Promise.all([
    pullAllProducts(),
    pullAllStores(),
    pullTaxPercentage(),
    pullAllCustomers(),
    pullAllUsers(),
    pullRecentBills(),
  ]);
  startSyncQueueLoop();
  startPeriodicRefreshLoop();
  console.log(`[initial sync] complete (reason: ${reason})`);
}
