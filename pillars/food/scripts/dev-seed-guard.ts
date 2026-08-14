/**
 * Refusal guard for food's dev seeder.
 *
 * Seeding deletes every row in food's tables before inserting fixtures, and
 * AGENTS.md "Production" makes seed/clear/reset dev and test only. Two signals
 * make that enforceable rather than a convention:
 *
 *   1. `NODE_ENV=production`, which every deployed pillar container sets.
 *   2. The target file must resolve inside the food package. A deployed
 *      database lives on the container volume at `/data/sqlite/food.db`, so
 *      `SQLITE_PATH` pointing there is refused even when `NODE_ENV` is not
 *      set — which is exactly the shape of an operator running the seeder by
 *      hand on the host. Symlinks resolve before the containment test.
 *
 * Neither has an override; an escape hatch here is the same as no guard.
 */
import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export class SeedTargetRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedTargetRefusedError';
  }
}

export interface SeedTarget {
  /** Database the seeder is about to wipe and repopulate. Need not exist yet. */
  readonly dbPath: string;
  /** The food package directory the target must live inside. */
  readonly packageRoot: string;
  readonly env?: Record<string, string | undefined>;
}

/**
 * Throw {@link SeedTargetRefusedError} unless `target` is a development or
 * test database. Returns the symlink-resolved absolute path on success.
 */
export function assertSeedTargetIsDev(target: SeedTarget): string {
  const env = target.env ?? process.env;
  if (env['NODE_ENV']?.trim().toLowerCase() === 'production') {
    throw new SeedTargetRefusedError(
      "refusing to seed with NODE_ENV='production' — the food seeder is development and test only"
    );
  }

  const packageRoot = resolveThroughSymlinks(resolve(target.packageRoot));
  const dbPath = resolveThroughSymlinks(resolve(target.dbPath));
  const rel = relative(packageRoot, dbPath);
  if (rel === '' || isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) {
    throw new SeedTargetRefusedError(
      `refusing to seed '${dbPath}': it resolves outside the food package (${packageRoot}). Deployed databases live on the container volume; the seeder is development and test only`
    );
  }

  return dbPath;
}

function resolveThroughSymlinks(target: string): string {
  const missing: string[] = [];
  let current = target;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return target;
    missing.unshift(basename(current));
    current = parent;
  }
  return missing.length === 0 ? realpathSync(current) : join(realpathSync(current), ...missing);
}
