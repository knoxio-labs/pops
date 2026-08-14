import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CANONICAL,
  checkAllCopies,
  checkFixture,
  FIXTURE_COPIES,
  KNOWN_FIXTURE_COPY_PATHS,
} from '../check-refresh-message-fixture.mjs';
import { discoverFilesNamed, isFileNotFound } from '../fixture-copies.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const guardPath = resolve(here, '..', 'check-refresh-message-fixture.mjs');

type Fixture = Parameters<typeof checkFixture>[0];

/**
 * Reads a committed copy under the same `string | null` contract
 * {@link checkAllCopies} is given in production — `null` means absent, and only
 * absent. It shares the production reader's predicate rather than repeating the
 * errno check, so a copy that goes missing fails as the guard's own "missing"
 * message while a copy that is present but unreadable surfaces the real error.
 */
const readCommitted = (repoRelativePath: string) => {
  try {
    return readFileSync(join(repoRoot, repoRelativePath), 'utf8');
  } catch (error) {
    if (isFileNotFound(error)) return null;
    throw error;
  }
};

function requireCommitted(repoRelativePath: string) {
  const text = readCommitted(repoRelativePath);
  if (text === null) throw new Error(`missing committed fixture copy: ${repoRelativePath}`);
  return text;
}

const committed: Fixture = JSON.parse(requireCommitted(CANONICAL.path));

const vendored = (() => {
  const found = FIXTURE_COPIES.find((copy) => copy.path !== CANONICAL.path);
  if (found === undefined) throw new Error('no vendored copy of the refresh-message vector');
  return found;
})();

/** The set `checkAllCopies` is handed in production when nothing undeclared exists. */
const declaredOnly = FIXTURE_COPIES.map((copy) => copy.path);

/** The message the format defines, rebuilt from a fixture's own parts. */
function messageOf(fixture: Fixture): string {
  return `${fixture.domain}\n${fixture.nonce}\n${fixture.refreshTokenSha256Hex}`;
}

/** A fixture whose message is `text`, everything else untouched. */
function withMessage(fixture: Fixture, text: string): Fixture {
  return { ...fixture, messageBase64: Buffer.from(text, 'utf8').toString('base64') };
}

/**
 * A whole, internally consistent vector for inputs this suite chose.
 *
 * The committed one came from the pillar's `refreshSignatureMessage()`.
 * Building an equivalent here and asserting it also passes is what proves the
 * checker validates the FORMAT rather than having been fitted to one triple.
 */
function equivalentFixture(nonce: string, refreshToken: string): Fixture {
  const refreshTokenSha256Hex = createHash('sha256').update(refreshToken, 'utf8').digest('hex');
  const parts = { ...committed, nonce, refreshToken, refreshTokenSha256Hex };
  return withMessage(parts, messageOf(parts));
}

describe('the committed vector', () => {
  it('passes every format assertion', () => {
    expect(checkFixture(committed)).toEqual([]);
  });

  it('exists once per consumer, byte-identical', () => {
    expect(FIXTURE_COPIES.length).toBeGreaterThan(1);
    expect(checkAllCopies(readCommitted, declaredOnly)).toEqual([]);
  });

  it('has no undeclared same-named copy anywhere under pillars/, libs/ or clients/', () => {
    const discovered = discoverFilesNamed(
      repoRoot,
      ['pillars', 'libs', 'clients'],
      'refresh-message-v1.json'
    );

    expect(discovered).toEqual([...declaredOnly].toSorted());
  });

  it('declares exactly the paths KNOWN_FIXTURE_COPY_PATHS pins', () => {
    // KNOWN_FIXTURE_COPY_PATHS is the guard's own independent pin (see its doc
    // comment in check-refresh-message-fixture.mjs) — a literal the
    // `--self-test` CLI path checks FIXTURE_COPIES against, typed by hand
    // rather than derived from FIXTURE_COPIES. Reusing it here rather than
    // duplicating a second hand-typed array keeps this test and the CLI path
    // checking the exact same expectation. A copy landing in FIXTURE_COPIES
    // without a matching update to KNOWN_FIXTURE_COPY_PATHS in the same
    // commit is the friction ADR-045 asks for.
    expect(FIXTURE_COPIES.map((copy) => copy.path).toSorted()).toEqual(
      [...KNOWN_FIXTURE_COPY_PATHS].toSorted()
    );
  });

  it('is canonical in the pillar that defines the format, vendored in the client', () => {
    // The mirror of the device-signature vector next to it, and the reason the
    // copy machinery takes the canonical path as an argument rather than
    // deriving it from a shared prefix: only CryptoKit can produce a real
    // signature, but only the BFM can say what a refresh message is.
    expect(CANONICAL.path.startsWith('pillars/bfm/')).toBe(true);
    expect(vendored.path.startsWith('clients/ios/')).toBe(true);
  });

  it('decodes to the message the BFM header describes', () => {
    const message = Buffer.from(committed.messageBase64, 'base64').toString('utf8');

    expect(message).toBe(`BFM-REFRESH-V1\n${committed.nonce}\n${committed.refreshTokenSha256Hex}`);
  });
});

describe('checkFixture', () => {
  it('accepts an equivalent vector built independently from other inputs', () => {
    expect(checkFixture(equivalentFixture('another-nonce', 'another-token'))).toEqual([]);
  });

  it('rejects a domain prefix changed on one side only', () => {
    const failures = checkFixture(
      withMessage(committed, messageOf(committed).replace('BFM-REFRESH-V1', 'BFM-REFRESH-V2'))
    );

    expect(failures.join('\n')).toContain('does not decode to the signed message');
  });

  it('rejects a domain prefix changed everywhere, pin included', () => {
    // The case a regeneration produces, and the reason the guard restates the
    // contract instead of reading it out of the file it is checking.
    const moved = { ...committed, domain: 'BFM-REFRESH-V2' };

    const failures = checkFixture(withMessage(moved, messageOf(moved)));

    expect(failures.join('\n')).toContain('domain: fixture says "BFM-REFRESH-V2"');
  });

  it('rejects a trailing newline', () => {
    const failures = checkFixture(withMessage(committed, `${messageOf(committed)}\n`));

    expect(failures.join('\n')).toContain('ends in a newline');
  });

  it('rejects a separator count that is not two', () => {
    const joined = `${committed.domain}\n${committed.nonce}${committed.refreshTokenSha256Hex}`;

    const failures = checkFixture(withMessage(committed, joined));

    expect(failures.join('\n')).toContain('newline separator(s), expected 2');
  });

  it('rejects an uppercase digest, which Node’s digest(hex) never produces', () => {
    const upper = {
      ...committed,
      refreshTokenSha256Hex: committed.refreshTokenSha256Hex.toUpperCase(),
    };

    const failures = checkFixture(withMessage(upper, messageOf(upper)));

    expect(failures.join('\n')).toContain('64 lowercase hex characters');
  });

  it('rejects a message that signs the token instead of its digest', () => {
    const leaking = `${committed.domain}\n${committed.nonce}\n${committed.refreshToken}`;

    const failures = checkFixture(withMessage(committed, leaking));

    expect(failures.join('\n')).toContain('carries the refresh token itself');
  });

  it('rejects a digest that does not belong to the token beside it', () => {
    const failures = checkFixture({ ...committed, refreshToken: 'a different token' });

    expect(failures.join('\n')).toContain('not SHA-256 of refreshToken');
  });

  it('rejects a nonce that is not the one inside the message', () => {
    const failures = checkFixture({ ...committed, nonce: `${committed.nonce}x` });

    expect(failures.join('\n')).toContain('does not decode to the signed message');
  });

  it('rejects a version that drifted from the contract', () => {
    const failures = checkFixture({ ...committed, version: 2 });

    expect(failures.join('\n')).toContain('version: fixture says 2');
  });

  it('rejects non-canonical base64 rather than silently normalising it', () => {
    // `Buffer.from(_, 'base64')` skips whitespace, so a copy that picked up a
    // line break would decode to the right bytes here and to nothing at all in
    // a stricter decoder on the other side.
    const failures = checkFixture({
      ...committed,
      messageBase64: `${committed.messageBase64.slice(0, 8)}\n${committed.messageBase64.slice(8)}`,
    });

    expect(failures.join('\n')).toContain('not the canonical base64');
  });

  it('reports a missing field without throwing', () => {
    for (const field of ['nonce', 'refreshToken', 'refreshTokenSha256Hex', 'messageBase64']) {
      const failures = checkFixture({ ...committed, [field]: undefined } as unknown as Fixture);

      expect(failures.join('\n')).toContain(`${field}: missing or not a non-empty string`);
    }
  });

  it('reports a fixture that is the wrong shape entirely without throwing', () => {
    const failures = checkFixture({} as unknown as Fixture);

    expect(failures.length).toBeGreaterThan(0);
  });
});

describe('checkAllCopies', () => {
  const text = JSON.stringify(committed);
  const identical: Map<string, string> = new Map(FIXTURE_COPIES.map(({ path }) => [path, text]));
  const readerOver = (files: Map<string, string>) => (path: string) => files.get(path) ?? null;
  const withVendored = (contents: string | null) => {
    const files = new Map(identical);
    if (contents === null) files.delete(vendored.path);
    else files.set(vendored.path, contents);
    return readerOver(files);
  };

  it('passes when every copy is byte-identical', () => {
    expect(checkAllCopies(readerOver(identical), declaredOnly)).toEqual([]);
  });

  it('catches a vendored copy edited on its own', () => {
    expect(
      checkAllCopies(withVendored(JSON.stringify({ ...committed, version: 2 })), declaredOnly).join(
        '\n'
      )
    ).toContain('drifted from');
  });

  it('catches a canonical copy edited on its own', () => {
    const files = new Map(identical).set(
      CANONICAL.path,
      JSON.stringify({ ...committed, version: 2 })
    );

    expect(checkAllCopies(readerOver(files), declaredOnly).join('\n')).toContain('drifted from');
  });

  it('catches a copy that is only reformatted, not semantically changed', () => {
    expect(
      checkAllCopies(withVendored(JSON.stringify(committed, null, 4)), declaredOnly).join('\n')
    ).toContain('drifted from');
  });

  it('catches a missing copy rather than silently checking one', () => {
    expect(checkAllCopies(withVendored(null), declaredOnly).join('\n')).toContain('missing');
  });

  it('reports unparseable JSON against the copy it came from', () => {
    const failures = checkAllCopies(withVendored('{ not json'), declaredOnly).join('\n');

    expect(failures).toContain(vendored.path);
    expect(failures).toContain('not parseable as JSON');
  });

  it('attributes a format failure to the copy that carries it', () => {
    const broken = JSON.stringify(withMessage(committed, `${messageOf(committed)}\n`));

    const failures = checkAllCopies(withVendored(broken), declaredOnly);

    expect(failures.some((f) => f.startsWith(`${vendored.path}: `))).toBe(true);
    expect(failures.some((f) => f.startsWith(`${CANONICAL.path}: `))).toBe(false);
  });

  it('reports a same-named file discovered outside FIXTURE_COPIES, by name, without touching disk', () => {
    const planted = 'pillars/purchases/contracts/refresh-message-v1.json';

    const failures = checkAllCopies(readerOver(identical), [...declaredOnly, planted]);

    expect(failures.join('\n')).toContain(planted);
    expect(failures.join('\n')).toContain('undeclared copy');
  });

  it('does not flag the canonical copy as undeclared', () => {
    expect(checkAllCopies(readerOver(identical), [CANONICAL.path])).toEqual([]);
  });
});

describe('the guard CLI', () => {
  it('its self-test passes, including the independent copy-set pin, the fabricated discovery leg and the real-tree discovery leg', () => {
    const stdout = execFileSync('node', [guardPath, '--self-test'], { encoding: 'utf8' });

    expect(stdout).toContain(
      `self-test OK — declares exactly the ${KNOWN_FIXTURE_COPY_PATHS.length} pinned fixture copy path(s).`
    );
    expect(stdout).toMatch(/self-test OK — reports a same-named file discovered outside/u);
    expect(stdout).toMatch(
      /self-test OK — no undeclared copy of refresh-message-v1\.json is on disk/u
    );
  });

  // `--self-test` now runs `selfTestRealTreeDiscovery` (fixture-copies.mjs)
  // against the actual repo tree, the same leg check-vendored-contracts.mjs's
  // `selfTestLegSet` runs via `findUnvendoredContracts(repoRoot)` — see the
  // same note in check-device-signature-fixture.test.ts. A test that PLANTS
  // an undeclared copy for real and re-runs the CLI against the actual repo
  // tree is still deliberately not here — it would be visible to every other
  // tree-scanning guard's own suite running concurrently in
  // `vitest run scripts/`, producing a spurious failure unrelated to this
  // one. That path was proven manually instead: guard run clean, a copy
  // planted at pillars/purchases/contracts/refresh-message-v1.json, guard
  // AND --self-test re-run and both shown to exit 1 naming the planted file,
  // plant removed by filename, guard re-run clean again.
});
