/**
 * Resolution of the service-account key this server presents to every pillar.
 *
 * Every tool in `allTools` proxies a pillar through `getPillar()`, so a
 * keyless process serves nothing at all. It used to reach that state quietly:
 * the `POPS_API_KEY_FILE` read was best-effort, an unreadable secret produced a
 * `console.warn` and boot continued, and the failure only surfaced later as a
 * per-call error naming two variables that production compose does not set
 * (it sets the `_FILE` one). Meanwhile the Docker healthcheck probed `/health`,
 * which is deliberately upstream-free and unconditionally ok — so the container
 * was green, `restart: unless-stopped` never tripped, and watchtower kept
 * rolling a server that could not answer a single tool call (POPS-2760).
 *
 * The shape here matches bfm's `configureBfmServerSdk`, which resolves its key
 * before the server listens and throws when it cannot: a pillar that was told
 * where its credential lives and cannot produce one must not reach a state that
 * looks healthy.
 */
import { readFileSync } from 'node:fs';

export const API_KEY_FILE_ENV = 'POPS_API_KEY_FILE';
export const INTERNAL_API_KEY_ENV = 'POPS_INTERNAL_API_KEY';
export const LEGACY_API_KEY_ENV = 'POPS_API_KEY';

/** Boot-fatal: no source produced a key, so no tool could ever succeed. */
export class MissingServiceAccountKeyError extends Error {
  override readonly name = 'MissingServiceAccountKeyError' as const;

  constructor() {
    super(
      `[pops-mcp] no service-account key: set ${API_KEY_FILE_ENV} to a mounted secret ` +
        `(production) or ${INTERNAL_API_KEY_ENV} / ${LEGACY_API_KEY_ENV} (local dev). ` +
        'Every tool this server exposes proxies a pillar, so none of them can work without one.'
    );
  }
}

/**
 * Read a declared secret file, or `undefined` when the path is absent or the
 * read fails.
 *
 * An unreadable file is warned about rather than thrown, because an env var may
 * still carry a usable key and {@link resolveServiceAccountKey}'s caller fails
 * boot when neither source produces one — the same division bfm's
 * `service-account.ts` draws. Reporting the path is safe; reporting the
 * contents never is.
 */
function readKeyFile(path: string | undefined): string | undefined {
  if (path === undefined || path.trim() === '') return undefined;
  let contents: string;
  try {
    contents = readFileSync(path.trim(), 'utf8').trim();
  } catch (error) {
    console.warn(
      `[pops-mcp] could not read ${API_KEY_FILE_ENV} (${path}): ` +
        (error instanceof Error ? error.message : String(error))
    );
    return undefined;
  }
  return contents === '' ? undefined : contents;
}

/**
 * The service-account key, file source first, then either env var.
 *
 * @param env Process environment to read; injectable for tests.
 * @returns The trimmed key, or `undefined` when no source yields a non-empty value.
 */
export function resolveServiceAccountKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const fromFile = readKeyFile(env[API_KEY_FILE_ENV]);
  if (fromFile !== undefined) return fromFile;
  for (const name of [INTERNAL_API_KEY_ENV, LEGACY_API_KEY_ENV] as const) {
    const value = env[name]?.trim();
    if (value !== undefined && value !== '') return value;
  }
  return undefined;
}

/**
 * Resolve the key and publish it as `POPS_API_KEY`, which is what
 * `pillar-client.ts` reads when it configures the server SDK.
 *
 * Called once, before the server listens. Throws
 * {@link MissingServiceAccountKeyError} when no source produces a key — fatal
 * by design, so the container dies visibly instead of serving a green
 * healthcheck and failing every call.
 *
 * @param env Process environment to read and populate; injectable for tests.
 */
export function requireServiceAccountKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = resolveServiceAccountKey(env);
  if (key === undefined) throw new MissingServiceAccountKeyError();
  env[LEGACY_API_KEY_ENV] = key;
  return key;
}
