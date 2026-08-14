/**
 * `check-vendored-contracts.mjs` closes a specific silent-pass hole (see the
 * guard's own doc comment and ADR-045): a directory scan finds nothing when a
 * consumer's `contracts/`/`Contracts/` directory moves, and "found nothing"
 * used to print as `OK`. These tests exercise both halves of the fix —
 * `deriveExpectedContracts`/`findMoved` catching a moved directory the scan
 * cannot see, and the CLI's own floor failing loudly on total loss — plus the
 * `readOrNull` not-found/unreadable split.
 */
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  deriveExpectedContracts,
  discoverVendoredContracts,
  findDrift,
  findMoved,
  KNOWN_VENDORED_LEGS,
  readOrNull,
  statKind,
} from '../check-vendored-contracts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const guardPath = join(repoRoot, 'scripts', 'ci', 'check-vendored-contracts.mjs');

const created: string[] = [];

/**
 * Index element 0 under `noUncheckedIndexedAccess` without an assertion —
 * throws if the array turns out empty, which only happens if a `toHaveLength`
 * assertion immediately above the call site was itself wrong.
 */
function first<T>(items: readonly T[]): T {
  const [item] = items;
  if (item === undefined) throw new Error('expected at least one item, got an empty array');
  return item;
}

/**
 * `os.tmpdir()` sits behind a symlink on macOS (`/var` → `/private/var`), and
 * the guard's own `main()` gate compares `resolve(process.argv[1])` against
 * `resolve(fileURLToPath(import.meta.url))` — the latter comes back
 * realpath-resolved from Node's ESM loader, the former does not. Spawning the
 * guard at a non-realpath'd sandbox path makes that comparison fail and the
 * guard silently do nothing (exit 0, no output) — indistinguishable from
 * "nothing to check" until you go looking, which is exactly the class of bug
 * this file exists to catch elsewhere. Realpath-ing the fixture root once,
 * here, keeps every path built from it already in the form the loader will
 * report.
 */
function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'vendored-contracts-test-'));
  created.push(root);
  return realpathSync(root);
}

afterEach(() => {
  while (created.length > 0) rmSync(created.pop() as string, { recursive: true, force: true });
});

/**
 * Plant one working vendored-contract pair in a fixture tree: a producer spec
 * under `pillars/<pillarId>/openapi/`, a vendored copy under
 * `pillars/<consumer>/app/contracts/`, and the codegen config that declares
 * it — the same shape `pillars/finance/app` uses for `contacts`.
 */
function plantTsPair(root: string, consumer: string, pillarId: string, contents = '{}\n'): void {
  mkdirSync(join(root, 'pillars', pillarId, 'openapi'), { recursive: true });
  writeFileSync(join(root, 'pillars', pillarId, 'openapi', `${pillarId}.openapi.json`), contents);

  const contractsDir = join(root, 'pillars', consumer, 'app', 'contracts');
  mkdirSync(contractsDir, { recursive: true });
  writeFileSync(join(contractsDir, `${pillarId}.openapi.json`), contents);

  mkdirSync(join(root, 'pillars', consumer, 'app'), { recursive: true });
  writeFileSync(
    join(root, 'pillars', consumer, 'app', `openapi-ts.${pillarId}.config.ts`),
    `export default { input: fileURLToPath(new URL('./contracts/${pillarId}.openapi.json', import.meta.url)) };\n`
  );
}

/** Declare a TS consumer's dependency on a vendored copy WITHOUT creating the copy — the "moved" case. */
function declareTsPairWithoutCopy(root: string, consumer: string, pillarId: string): void {
  mkdirSync(join(root, 'pillars', pillarId, 'openapi'), { recursive: true });
  writeFileSync(join(root, 'pillars', pillarId, 'openapi', `${pillarId}.openapi.json`), '{}\n');

  mkdirSync(join(root, 'pillars', consumer, 'app'), { recursive: true });
  writeFileSync(
    join(root, 'pillars', consumer, 'app', `openapi-ts.${pillarId}.config.ts`),
    `export default { input: fileURLToPath(new URL('./contracts/${pillarId}.openapi.json', import.meta.url)) };\n`
  );
}

describe('discoverVendoredContracts / deriveExpectedContracts against the real repo', () => {
  it('agree on exactly the legs KNOWN_VENDORED_LEGS pins', () => {
    // KNOWN_VENDORED_LEGS is the guard's own independent pin (see its doc
    // comment in check-vendored-contracts.mjs) — a literal the self-test
    // checks the real tree against, typed by hand rather than derived from
    // VENDOR_DIRECTORIES. Reusing it here rather than duplicating a second
    // hand-typed array keeps this test and the `--self-test` CLI path
    // checking the exact same expectation instead of two lists that could
    // drift from each other. A new leg landing here without updating
    // KNOWN_VENDORED_LEGS in the same commit is the friction ADR-045 asks
    // for — visible on the commit that adds it, not a silently-widened floor.
    const discovered = discoverVendoredContracts(repoRoot);
    const expected = deriveExpectedContracts(repoRoot);

    const discoveredLegs = discovered
      .map((c) => `${c.pillarId} -> ${c.copy.slice(repoRoot.length + 1)}`)
      .toSorted();
    const expectedPaths = expected.map((c) => c.copy.slice(repoRoot.length + 1)).toSorted();

    expect(discoveredLegs).toEqual([...KNOWN_VENDORED_LEGS].toSorted());
    expect(expectedPaths).toEqual(
      discovered.map((c) => c.copy.slice(repoRoot.length + 1)).toSorted()
    );
  });

  it('leaves every discovered copy free of drift or orphaning against the real tree', () => {
    const findings = findDrift(discoverVendoredContracts(repoRoot), readOrNull);
    expect(findings).toEqual([]);
  });

  it('leaves every declared expectation present on disk in the real tree', () => {
    const findings = findMoved(deriveExpectedContracts(repoRoot), statKind);
    expect(findings).toEqual([]);
  });
});

describe('deriveExpectedContracts', () => {
  it('derives a TS consumer’s declared copy from its openapi-ts config, matching discovery', () => {
    const root = fixtureRoot();
    plantTsPair(root, 'consumer-a', 'producer-a');

    const discovered = discoverVendoredContracts(root);
    const expected = deriveExpectedContracts(root);

    expect(expected).toHaveLength(1);
    expect(first(expected).copy).toBe(first(discovered).copy);
    expect(first(expected).source).toBe(first(discovered).source);
    expect(first(expected).declaredBy).toBe(
      join(root, 'pillars', 'consumer-a', 'app', 'openapi-ts.producer-a.config.ts')
    );
  });

  it('derives an iOS-style consumer’s declared copy from its mise.toml task', () => {
    const root = fixtureRoot();
    mkdirSync(join(root, 'pillars', 'bfm-like', 'openapi'), { recursive: true });
    writeFileSync(join(root, 'pillars', 'bfm-like', 'openapi', 'bfm-like.openapi.json'), '{}\n');

    const consumerDir = join(root, 'clients', 'ios-like');
    mkdirSync(join(consumerDir, 'Contracts'), { recursive: true });
    writeFileSync(join(consumerDir, 'Contracts', 'bfm-like.openapi.json'), '{}\n');
    writeFileSync(
      join(consumerDir, 'mise.toml'),
      [
        '[tasks."generate:bfm-like-client"]',
        "run = '''",
        'canonical=../../pillars/bfm-like/openapi/bfm-like.openapi.json',
        'vendored=Contracts/bfm-like.openapi.json',
        "'''",
        '',
      ].join('\n')
    );

    const expected = deriveExpectedContracts(root);

    expect(expected).toHaveLength(1);
    expect(first(expected).copy).toBe(join(consumerDir, 'Contracts', 'bfm-like.openapi.json'));
    expect(first(expected).pillarId).toBe('bfm-like');
  });

  it('reports nothing declared for a consumer with no matching config', () => {
    const root = fixtureRoot();
    mkdirSync(join(root, 'pillars', 'lonely-consumer', 'app'), { recursive: true });
    writeFileSync(
      join(root, 'pillars', 'lonely-consumer', 'app', 'openapi-ts.config.ts'),
      "export default { input: '../openapi/lonely-consumer.openapi.json' };\n" // own contract, not vendored
    );

    expect(deriveExpectedContracts(root)).toEqual([]);
  });
});

describe('findMoved', () => {
  it('reports nothing when every declared copy is on disk', () => {
    const root = fixtureRoot();
    plantTsPair(root, 'consumer-a', 'producer-a');

    const findings = findMoved(deriveExpectedContracts(root), statKind);
    expect(findings).toEqual([]);
  });

  it('reports a consumer whose contracts directory has moved as a failure, not silence', () => {
    // The exact degenerate case this guard exists for: the config still
    // names the vendored copy's path, but the file is not there — because
    // the consumer's `contracts/` directory moved (or was renamed) without
    // re-vendoring into the new location. A directory-scan-only guard finds
    // nothing here and says nothing; `findMoved` must say something.
    const root = fixtureRoot();
    declareTsPairWithoutCopy(root, 'consumer-a', 'producer-a');

    const expected = deriveExpectedContracts(root);
    expect(expected).toHaveLength(1); // the declaration itself is still discoverable

    const findings = findMoved(expected, statKind);
    expect(findings).toHaveLength(1);
    expect(first(findings).kind).toBe('moved');
    expect(first(findings).copy).toBe(
      join(root, 'pillars', 'consumer-a', 'app', 'contracts', 'producer-a.openapi.json')
    );
  });

  it('does not confuse one consumer moving with another remaining intact', () => {
    // The specific partial-loss scenario a bare `discovered.length === 0`
    // floor cannot catch: one consumer's copy vanishes while a second,
    // unrelated consumer's copy is untouched, so the discovered set is still
    // non-empty and a floor alone would print OK.
    const root = fixtureRoot();
    plantTsPair(root, 'consumer-intact', 'producer-intact');
    declareTsPairWithoutCopy(root, 'consumer-moved', 'producer-moved');

    const discovered = discoverVendoredContracts(root);
    expect(discovered).toHaveLength(1); // only the intact one is visible to the scan

    const findings = findMoved(deriveExpectedContracts(root), statKind);
    expect(findings).toHaveLength(1);
    expect(first(findings).copy).toContain('consumer-moved');
  });

  it('reports a directory sitting at the declared path as not-a-file, not as present', () => {
    // `existsSync` alone would call this "present" — a directory satisfies
    // it just as a file would — even though `discoverVendoredContracts`
    // would never treat a directory as a vendored copy (it filters to
    // `entry.isFile()`). That gap would let a broken vendored "copy" read as
    // healthy here while being invisible to the byte-drift check.
    const root = fixtureRoot();
    plantTsPair(root, 'consumer-a', 'producer-a');
    const expected = deriveExpectedContracts(root);
    const declaredPath = first(expected).copy;

    rmSync(declaredPath);
    mkdirSync(declaredPath);
    expect(existsSync(declaredPath)).toBe(true); // sanity: existsSync alone is fooled

    const findings = findMoved(expected, statKind);
    expect(findings).toHaveLength(1);
    expect(first(findings).kind).toBe('not-a-file');
    expect(first(findings).copy).toBe(declaredPath);
  });

  it('reports a stat failure as unreadable rather than crashing or silently passing', () => {
    const root = fixtureRoot();
    plantTsPair(root, 'consumer-a', 'producer-a');
    const expected = deriveExpectedContracts(root);

    const eacces = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    const throwingStat = () => {
      throw eacces;
    };

    const findings = findMoved(expected, throwingStat);
    expect(findings).toHaveLength(1);
    expect(first(findings).kind).toBe('unreadable');
    expect(first(findings).detail).toContain('could not be checked');
  });
});

describe('statKind', () => {
  it('returns "absent" for a path that does not exist', () => {
    const root = fixtureRoot();
    expect(statKind(join(root, 'does-not-exist.json'))).toBe('absent');
  });

  it('returns "file" for a regular file', () => {
    const root = fixtureRoot();
    const path = join(root, 'present.json');
    writeFileSync(path, '{}\n');
    expect(statKind(path)).toBe('file');
  });

  it('returns "not-a-file" for a directory', () => {
    const root = fixtureRoot();
    const path = join(root, 'a-directory');
    mkdirSync(path);
    expect(statKind(path)).toBe('not-a-file');
  });

  it('throws, rather than returning "absent", when the path exists but cannot be stat-ed', () => {
    // Same root-skip rationale as readOrNull's equivalent test below: root
    // bypasses permission bits entirely, so the distinction is unenforceable
    // there.
    if (typeof process.getuid === 'function' && process.getuid() === 0) return;

    const root = fixtureRoot();
    const blocked = join(root, 'blocked');
    mkdirSync(blocked);
    const path = join(blocked, 'present.json');
    writeFileSync(path, '{}\n');
    chmodSync(blocked, 0o000);

    try {
      expect(() => statKind(path)).toThrow();
    } finally {
      chmodSync(blocked, 0o755); // afterEach's rmSync needs to traverse back in
    }
  });
});

describe('findDrift', () => {
  const contract = { copy: '/x/copy.json', source: '/x/source.json', pillarId: 'x' };

  it('passes an identical pair', () => {
    const read = (p: string) => (p.endsWith('.json') ? '{"a":1}\n' : null);
    expect(findDrift([contract], read)).toEqual([]);
  });

  it('flags drift when the bytes differ', () => {
    const read = (p: string) => (p === contract.copy ? '{"a":2}\n' : '{"a":1}\n');
    const findings = findDrift([contract], read);
    expect(findings).toEqual([{ kind: 'drift', copy: contract.copy, source: contract.source }]);
  });

  it('flags an orphan when the canonical source is absent', () => {
    const read = (p: string) => (p === contract.source ? null : '{"a":1}\n');
    const findings = findDrift([contract], read);
    expect(findings).toEqual([{ kind: 'orphan', copy: contract.copy, source: contract.source }]);
  });

  it('reports a permissions failure as unreadable rather than as an orphan', () => {
    // The bug this guard is fixing: a bare `catch { return null }` upstream
    // would make this indistinguishable from "source does not exist" and
    // print "orphan / stale or mis-named vendored copy" about a file that is
    // right there. `findDrift` must see the thrown error and report it as
    // what it is.
    const eacces = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    const read = (p: string) => {
      if (p === contract.source) throw eacces;
      return '{"a":1}\n';
    };

    const findings = findDrift([contract], read);
    expect(findings).toHaveLength(1);
    expect(first(findings).kind).toBe('unreadable');
    expect(first(findings).detail).toContain('could not read the canonical source');
  });

  it('reports an unreadable vendored copy distinctly from an unreadable source', () => {
    const eacces = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    const read = (p: string) => {
      if (p === contract.copy) throw eacces;
      return '{"a":1}\n';
    };

    const findings = findDrift([contract], read);
    expect(findings).toHaveLength(1);
    expect(first(findings).kind).toBe('unreadable');
    expect(first(findings).detail).toContain('could not read the vendored copy');
  });
});

describe('readOrNull', () => {
  it('returns null for a path that does not exist', () => {
    const root = fixtureRoot();
    expect(readOrNull(join(root, 'does-not-exist.json'))).toBeNull();
  });

  it('returns the file contents when readable', () => {
    const root = fixtureRoot();
    const path = join(root, 'present.json');
    writeFileSync(path, '{"ok":true}\n');
    expect(readOrNull(path)).toBe('{"ok":true}\n');
  });

  it('throws, rather than returning null, when the file exists but cannot be read', () => {
    // Root can read anything regardless of mode bits, so this distinction is
    // untestable when the suite runs as root (as some CI/container setups
    // do) — skip rather than assert something the OS will not enforce.
    if (typeof process.getuid === 'function' && process.getuid() === 0) return;

    const root = fixtureRoot();
    const path = join(root, 'unreadable.json');
    writeFileSync(path, '{"a":1}\n');
    chmodSync(path, 0o000);

    try {
      expect(() => readOrNull(path)).toThrow();
    } finally {
      chmodSync(path, 0o644); // afterEach's rmSync needs to see inside the dir
    }
  });
});

describe('the guard CLI', () => {
  it('passes against the real repo, reporting both mechanisms agree', () => {
    const stdout = execFileSync('node', [guardPath], { encoding: 'utf8' });
    expect(stdout).toContain('OK —');
    expect(stdout).toContain('3 vendored contract(s)');
    expect(stdout).toContain('3 config-declared expectation(s)');
  });

  it('its self-test passes, including the independent leg-set pin', () => {
    const stdout = execFileSync('node', [guardPath, '--self-test'], { encoding: 'utf8' });
    expect(stdout).toContain(
      `self-test OK — discovers exactly the ${KNOWN_VENDORED_LEGS.length} pinned vendored leg(s).`
    );
  });

  it('fails loudly, not with OK, when discovery finds zero vendored contracts', () => {
    // Runs the real guard file (not a mock of its logic) against a sandbox
    // that has no `pillars/` or `clients/` at all, so `discoverVendoredContracts`
    // finds nothing. This is the exact defect the guard shipped with: `OK —
    // no vendored pillar contracts found.` on exit 0. It must now fail.
    const sandbox = fixtureRoot();
    cpSync(join(repoRoot, 'scripts', 'ci'), join(sandbox, 'scripts', 'ci'), { recursive: true });

    expect(() =>
      execFileSync('node', [join(sandbox, 'scripts', 'ci', 'check-vendored-contracts.mjs')], {
        stdio: 'pipe',
      })
    ).toThrow();

    let stderr = '';
    try {
      execFileSync('node', [join(sandbox, 'scripts', 'ci', 'check-vendored-contracts.mjs')], {
        stdio: 'pipe',
      });
    } catch (error) {
      stderr = String((error as { stderr?: Buffer }).stderr ?? '');
    }
    expect(stderr).toContain('discovered zero vendored pillar contracts');
    expect(stderr).not.toContain('OK —');
  });

  it('fails loudly, not with OK, when one consumer’s directory moved but another’s is intact', () => {
    // The partial-loss case: `discoverVendoredContracts` still finds ONE
    // real copy, so a bare "zero means fail" floor would not catch this —
    // the CLI has to consult `deriveExpectedContracts` too.
    const sandbox = fixtureRoot();
    cpSync(join(repoRoot, 'scripts', 'ci'), join(sandbox, 'scripts', 'ci'), { recursive: true });
    plantTsPair(sandbox, 'consumer-intact', 'producer-intact');
    declareTsPairWithoutCopy(sandbox, 'consumer-moved', 'producer-moved');

    let stderr = '';
    let threw = false;
    try {
      execFileSync('node', [join(sandbox, 'scripts', 'ci', 'check-vendored-contracts.mjs')], {
        stdio: 'pipe',
      });
    } catch (error) {
      threw = true;
      stderr = String((error as { stderr?: Buffer }).stderr ?? '');
    }

    expect(threw).toBe(true);
    expect(stderr).toContain('consumer-moved');
    expect(stderr).toContain('not on disk');
  });
});
