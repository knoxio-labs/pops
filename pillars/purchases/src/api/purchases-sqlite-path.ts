import { dirname, join } from 'node:path';

/**
 * Resolver for the purchases pillar's SQLite path.
 *
 * `SQLITE_PATH` is honoured (a deployer who sets only the shared path still
 * lands `purchases.db` in that directory) so a single env can point a whole
 * fleet at one data dir without per-pillar overrides.
 *
 * Resolution order:
 *   1. `PURCHASES_SQLITE_PATH` (absolute or relative).
 *   2. `<dirname(SQLITE_PATH)>/purchases.db` if the shared path is set.
 *   3. `./data/purchases.db`.
 */
export const DEFAULT_PURCHASES_SQLITE_PATH = './data/purchases.db';

export function resolvePurchasesSqlitePath(): string {
  const envPath = process.env['PURCHASES_SQLITE_PATH'];
  if (envPath) return envPath;
  const sharedPath = process.env['SQLITE_PATH'];
  if (sharedPath) return join(dirname(sharedPath), 'purchases.db');
  return DEFAULT_PURCHASES_SQLITE_PATH;
}
