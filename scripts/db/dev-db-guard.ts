/**
 * Refusal guard for the destructive per-pillar database tasks.
 *
 * `db:clear:<id>` (and any future `db:seed:<id>`) deletes every row a pillar
 * owns. AGENTS.md "Production" makes those dev/test only, so the guard has to
 * be something an operator cannot forget rather than a convention:
 *
 *   1. `NODE_ENV=production` — every deployed pillar container sets it
 *      (`infra/docker-compose.yml`), so a script inheriting a service's
 *      environment refuses outright.
 *   2. The database file must resolve inside the repository working tree.
 *      Deployed databases live on a container volume at `/data/sqlite/<id>.db`;
 *      a developer's live under `pillars/<id>/data/`. Symlinks are resolved
 *      before the containment test, so a link planted inside the tree cannot
 *      smuggle the target back out to the volume.
 *
 * Both are checked every run and neither has an override flag — an escape
 * hatch here is the same as no guard.
 */
import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export class DevDatabaseGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DevDatabaseGuardError';
  }
}

export interface DevDatabaseTarget {
  /** Database file the caller is about to mutate. Need not exist yet. */
  readonly dbPath: string;
  /** Repository working tree the target must live inside. */
  readonly repoRoot: string;
  /** Environment to read `NODE_ENV` from. Defaults to `process.env`. */
  readonly env?: Record<string, string | undefined>;
}

/**
 * Throw {@link DevDatabaseGuardError} unless `target` is a development or test
 * database. Returns the symlink-resolved absolute path on success.
 */
export function assertDevDatabaseTarget(target: DevDatabaseTarget): string {
  const env = target.env ?? process.env;
  const nodeEnv = env['NODE_ENV']?.trim().toLowerCase();
  if (nodeEnv === 'production') {
    throw new DevDatabaseGuardError(
      "refusing to run a destructive database task with NODE_ENV='production' — seed/clear/reset are development and test only"
    );
  }

  const repoRoot = resolveThroughSymlinks(resolve(target.repoRoot));
  const dbPath = resolveThroughSymlinks(resolve(target.dbPath));
  if (!isInside(repoRoot, dbPath)) {
    throw new DevDatabaseGuardError(
      `refusing to run a destructive database task against '${dbPath}': it resolves outside the repository working tree (${repoRoot}). Deployed databases live on the container volume; seed/clear/reset are development and test only`
    );
  }

  return dbPath;
}

/**
 * Absolute path with every existing symlink component resolved. Missing
 * trailing segments are kept verbatim so a database file that has not been
 * created yet still resolves through the symlinks above it.
 */
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

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  if (rel === '') return false;
  if (isAbsolute(rel)) return false;
  return rel !== '..' && !rel.startsWith(`..${sep}`);
}
