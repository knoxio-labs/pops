/**
 * A pillar that reads a secret from a file asserts at boot that it can open
 * it.
 *
 * On capivara, 2026-09-09, `pops-finance` ran as uid 1000 with
 * `POPS_INTERNAL_API_KEY_FILE` pointing at a file owned by 1001 at mode 0440.
 * Every outbound leg authenticated as though nothing had been configured, for
 * days, while the pillar reported healthy — because a secret resolves lazily
 * and at the call site an unreadable file and an unset variable are the same
 * `no-credential` (POPS-3315).
 *
 * `assertSecretFilesReadable()` from `@pops/pillar-sdk/pillar-env` closes
 * that, and this asserts the wiring rather than the function: a pillar's
 * `server.ts` is not reached by its own suite — it is spawned as a real
 * process by a two-process test and excluded from coverage — so the call can
 * be dropped from an entry point without a single suite noticing.
 *
 * The pillar list is derived from each pillar's own source rather than
 * written out, because a hand-maintained list fails the same way the incident
 * did: a pillar that starts reading a `*_FILE` variable and is not added to
 * the list reads as clean. It is derived from source rather than from
 * `infra/docker-compose.yml` because the two disagree — finance reads
 * `POPS_INTERNAL_API_KEY_FILE` and this repo's compose sets it for neither
 * finance nor cerebrum (POPS-3379), which is its own ticket and not something this
 * guard should inherit.
 *
 * @see docs/architecture/adr-045-guards-must-prove-they-report.md
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** The call every such entry point must make, spelled as it appears in source. */
const PREFLIGHT_CALL = 'assertSecretFilesReadable()';

/** A complete quoted `*_FILE` environment-variable name. */
const FILE_ENV_LITERAL = /'[A-Z][A-Z0-9_]*_FILE'/u;

function namesAFileEnvVar(dir: string): boolean {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (namesAFileEnvVar(path)) return true;
      continue;
    }
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
    if (FILE_ENV_LITERAL.test(readFileSync(path, 'utf8'))) return true;
  }
  return false;
}

/**
 * Pillar ids that name a `*_FILE` environment variable anywhere in their
 * source and own a server entry point.
 *
 * Matched as a whole quoted string, not as a substring: `MAX_FILE_SIZE` and
 * `DEFAULT_MAX_FILE_BYTES` are constants three other pillars carry, and a
 * substring match would list them as reading a secret they do not have.
 */
export function pillarsReadingSecretFiles(root = repoRoot): string[] {
  const pillarsRoot = join(root, 'pillars');
  const found: string[] = [];
  for (const entry of readdirSync(pillarsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!existsSync(join(pillarsRoot, entry.name, 'src', 'api', 'server.ts'))) continue;
    if (namesAFileEnvVar(join(pillarsRoot, entry.name, 'src'))) found.push(entry.name);
  }
  return found.toSorted();
}

const reading = pillarsReadingSecretFiles();

describe('every pillar that reads a secret file proves at boot that it can', () => {
  it('finds pillars to check at all — an empty set would pass this file vacuously', () => {
    expect(reading.length).toBeGreaterThanOrEqual(4);
  });

  it('lists exactly the pillars that read one', () => {
    expect(reading).toEqual(['bfm', 'cerebrum', 'finance', 'purchases']);
  });

  it('reads whole variable names, not substrings of unrelated constants', () => {
    // `MAX_FILE_SIZE` and `DEFAULT_MAX_FILE_BYTES` are constants these three
    // carry. A substring match would demand a preflight from pillars with no
    // secret to check.
    expect(reading).not.toContain('food');
    expect(reading).not.toContain('inventory');
    expect(reading).not.toContain('media');
  });

  it.each(reading)('%s calls the preflight in its entry point', (id) => {
    const source = readFileSync(join(repoRoot, 'pillars', id, 'src', 'api', 'server.ts'), 'utf8');
    expect(source).toContain(PREFLIGHT_CALL);
  });

  it.each(reading)('%s calls it before it listens', (id) => {
    const source = readFileSync(join(repoRoot, 'pillars', id, 'src', 'api', 'server.ts'), 'utf8');
    const preflight = source.indexOf(PREFLIGHT_CALL);
    // Everything that resolves a credential does so after this point, so the
    // refusal has to come first. `.listen(` is the latest possible marker and
    // the one every entry point has.
    const listen = source.indexOf('.listen(');
    expect(preflight).toBeGreaterThan(-1);
    expect(listen).toBeGreaterThan(-1);
    expect(preflight).toBeLessThan(listen);
  });
});
