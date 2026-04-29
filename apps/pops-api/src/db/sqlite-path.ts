import { existsSync } from 'node:fs';

// Relative to CWD — valid when the server is started from apps/pops-api/ (e.g. `pnpm dev`).
// Production deployments always set SQLITE_PATH explicitly, so this fallback is local-dev-only.
export const DEFAULT_SQLITE_PATH = './data/pops.db';

export function resolveSqlitePath(): string {
  const envPath = process.env['SQLITE_PATH'];
  if (envPath) return envPath;
  if (!existsSync(DEFAULT_SQLITE_PATH)) {
    throw new Error(
      `[db] SQLITE_PATH is not set and fallback path '${DEFAULT_SQLITE_PATH}' does not exist. ` +
        `Copy apps/pops-api/.env.example to .env and set SQLITE_PATH to an absolute path.`
    );
  }
  console.warn(`[db] SQLITE_PATH not set — using fallback: ${DEFAULT_SQLITE_PATH}`);
  return DEFAULT_SQLITE_PATH;
}
