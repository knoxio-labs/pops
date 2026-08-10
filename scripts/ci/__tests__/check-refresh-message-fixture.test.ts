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
} from '../check-refresh-message-fixture.mjs';
import { isFileNotFound } from '../fixture-copies.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

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
    expect(checkAllCopies(readCommitted)).toEqual([]);
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
    expect(checkAllCopies(readerOver(identical))).toEqual([]);
  });

  it('catches a vendored copy edited on its own', () => {
    expect(
      checkAllCopies(withVendored(JSON.stringify({ ...committed, version: 2 }))).join('\n')
    ).toContain('drifted from');
  });

  it('catches a canonical copy edited on its own', () => {
    const files = new Map(identical).set(
      CANONICAL.path,
      JSON.stringify({ ...committed, version: 2 })
    );

    expect(checkAllCopies(readerOver(files)).join('\n')).toContain('drifted from');
  });

  it('catches a copy that is only reformatted, not semantically changed', () => {
    expect(checkAllCopies(withVendored(JSON.stringify(committed, null, 4))).join('\n')).toContain(
      'drifted from'
    );
  });

  it('catches a missing copy rather than silently checking one', () => {
    expect(checkAllCopies(withVendored(null)).join('\n')).toContain('missing');
  });

  it('reports unparseable JSON against the copy it came from', () => {
    const failures = checkAllCopies(withVendored('{ not json')).join('\n');

    expect(failures).toContain(vendored.path);
    expect(failures).toContain('not parseable as JSON');
  });

  it('attributes a format failure to the copy that carries it', () => {
    const broken = JSON.stringify(withMessage(committed, `${messageOf(committed)}\n`));

    const failures = checkAllCopies(withVendored(broken));

    expect(failures.some((f) => f.startsWith(`${vendored.path}: `))).toBe(true);
    expect(failures.some((f) => f.startsWith(`${CANONICAL.path}: `))).toBe(false);
  });
});
