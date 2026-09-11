import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Whether the module at `moduleUrl` is the file the process was started
 * with, so importing a CLI's `main` for a test — or from a sibling script
 * that re-exports it — does not also run the CLI.
 *
 * Both sides are resolved to the same shape before comparison:
 *
 * - Interpolating the entry path into a `file://` template instead of going
 *   through {@link pathToFileURL} compares an unencoded path against the
 *   percent-encoded URL `import.meta.url` always is, so any entry path
 *   containing a space, `#`, `?` or a non-ASCII character fails to match and
 *   the CLI silently does nothing — a checkout under `~/My Projects` is
 *   enough.
 * - Node's ESM loader resolves `import.meta.url` through any symlinked
 *   ancestor directory (a checkout under `/tmp` on macOS, which is itself a
 *   symlink to `/private/tmp`, is enough), but `process.argv[1]` is not
 *   realpath-resolved. Comparing `resolve(entryPath)` against `moduleUrl`
 *   without also realpath-resolving `entryPath` reintroduces exactly that
 *   mismatch. This resolves the entry path with {@link realpathSync} first,
 *   falling back to the merely-`resolve`d path when the entry does not exist
 *   on disk — an injected test path, for instance — since a path that cannot
 *   be realpath-resolved cannot be behind a symlink either.
 *
 * @param moduleUrl The calling module's `import.meta.url`.
 * @param entryPath The process entry path; injectable for tests. Defaults to
 *   `process.argv[1]`.
 */
export function isCliEntrypoint(
  moduleUrl: string,
  entryPath: string | undefined = process.argv[1]
): boolean {
  if (entryPath === undefined || entryPath === '') return false;
  const resolved = resolve(entryPath);
  let real: string;
  try {
    real = realpathSync(resolved);
  } catch {
    real = resolved;
  }
  return moduleUrl === pathToFileURL(real).href;
}
