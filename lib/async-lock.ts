// Serializes access to a named critical section within this process.
//
// tauri-plugin-sql's execute()/select() each independently borrow a
// connection from an underlying sqlx pool (confirmed: no exposed
// transaction command, no guarantee two calls share a connection), so
// BEGIN/COMMIT issued across separate execute() calls can't be trusted to
// be atomic. This app is a single desktop process though (not multiple
// concurrent server requests like the original Python race), so the actual
// fix for "two concurrent bill creations interleave" is simpler: serialize
// at the JS layer so only one critical section runs at a time, the same
// way billing-app/backend's file_write_lock.py fixed its race with a
// plain in-process lock rather than fighting file-level transactions.
const locks = new Map<string, Promise<unknown>>();

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  let release: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(key, previous.then(() => current));

  await previous;
  try {
    return await fn();
  } finally {
    release!();
    if (locks.get(key) === current) {
      locks.delete(key);
    }
  }
}
