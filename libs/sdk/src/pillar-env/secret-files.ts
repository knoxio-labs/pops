/**
 * The boot-time check that a mounted secret can actually be opened.
 *
 * On capivara, 2026-09-09, `pops-finance` ran as uid 1000 with
 * `POPS_INTERNAL_API_KEY_FILE` pointing at a file owned by 1001 at mode 0440:
 *
 * ```
 * -r--r----- 1 1001 1001 49 Aug 30 13:27 pops_finance_api_key
 * $ cat /run/secrets/pops_finance_api_key >/dev/null && echo OK || echo DENIED
 * DENIED
 * ```
 *
 * Every outbound leg — the entity matcher, the usage rollup, the import
 * commit's pre-create, the owner-URI cron — ran with no credential. The
 * pillar was healthy the whole time. That is the condition POPS-2689 was
 * closed to prevent, arriving through permissions instead of through a
 * missing line, and the reason it went unnoticed is that a secret resolves
 * lazily: at the call site an unreadable file and an unset variable are the
 * same `no-credential`, in a log nobody reads.
 *
 * So this asserts eagerly what the readers go on resolving lazily. The
 * distinction it draws is the one that matters:
 *
 * - **A variable that is not set** is not a finding. Several pillars run
 *   deliberately without a credential — finance's own contract surface needs
 *   none, and it reports the absence and serves — so an unset variable is a
 *   supported configuration, not a misconfiguration.
 * - **A variable set to a path that cannot be read** is always a bug. Someone
 *   put a path there; a process that cannot open it will silently behave as
 *   though nobody had.
 *
 * A pillar that boots healthy while structurally unable to authenticate is
 * worse than one that refuses to boot, so the caller is expected to let this
 * throw.
 */
import { accessSync, constants } from 'node:fs';

/** One `*_FILE` variable naming a path this process cannot read. */
export interface UnreadableSecretFile {
  /** The environment variable that named it. */
  readonly envVar: string;
  /** The path it named, trimmed. */
  readonly path: string;
  /** Why the open failed, as the OS reported it. */
  readonly reason: string;
}

/** At least one `*_FILE` variable names a path this process cannot read. */
export class UnreadableSecretFileError extends Error {
  override readonly name = 'UnreadableSecretFileError' as const;
  constructor(
    readonly files: readonly UnreadableSecretFile[],
    readonly uid: number | undefined
  ) {
    super(
      `Cannot read ${String(files.length)} configured secret file(s) as uid ` +
        `${uid === undefined ? 'unknown' : String(uid)}: ` +
        files.map((f) => `${f.envVar}=${f.path} (${f.reason})`).join('; ') +
        '. The variable is set, so something is meant to be there; a process that cannot open ' +
        'it authenticates as though nothing was configured at all.'
    );
  }
}

/** The two reads this check performs, injectable so a test can drive them. */
export interface SecretFileProbe {
  /** Throws when the path cannot be opened for reading. */
  readonly assertReadable: (path: string) => void;
  /** The uid the process runs as, for the message. `undefined` off POSIX. */
  readonly uid: () => number | undefined;
}

const nodeProbe: SecretFileProbe = {
  assertReadable: (path) => {
    accessSync(path, constants.R_OK);
  },
  uid: () => process.getuid?.(),
};

/**
 * Every `*_FILE` variable in `env` that is set to a non-empty path this
 * process cannot open for reading.
 *
 * The variables are discovered by name rather than declared per pillar. A
 * declaration list is one more thing to keep in step with the compose file,
 * and the failure it would have is the same silent one: a credential added to
 * a mount and not to the list reads as clean. `_FILE` is the convention every
 * pillar already follows, so the convention is what is checked.
 *
 * Paths are trimmed before they are opened. A path carrying stray whitespace
 * from a `.env` edit or a templated compose file names a file that does not
 * exist, and reporting it as unreadable is more useful than reporting the
 * untrimmed string as absent.
 *
 * @param env Environment to scan.
 * @param probe Filesystem reads; injected by tests.
 * @returns The offending variables, in the order they appear in `env`.
 */
export function findUnreadableSecretFiles(
  env: NodeJS.ProcessEnv,
  probe: SecretFileProbe = nodeProbe
): UnreadableSecretFile[] {
  const found: UnreadableSecretFile[] = [];
  for (const [envVar, raw] of Object.entries(env)) {
    if (!envVar.endsWith('_FILE')) continue;
    const path = raw?.trim() ?? '';
    if (path === '') continue;
    try {
      probe.assertReadable(path);
    } catch (error) {
      found.push({
        envVar,
        path,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return found;
}

/**
 * Throw unless every configured secret file can be opened.
 *
 * Call before the process listens, and do not catch it: refusing to boot is
 * the point.
 *
 * @param env Environment to scan; defaults to this process's.
 * @param probe Filesystem reads; injected by tests.
 */
export function assertSecretFilesReadable(
  env: NodeJS.ProcessEnv = process.env,
  probe: SecretFileProbe = nodeProbe
): void {
  const unreadable = findUnreadableSecretFiles(env, probe);
  if (unreadable.length > 0) throw new UnreadableSecretFileError(unreadable, probe.uid());
}
