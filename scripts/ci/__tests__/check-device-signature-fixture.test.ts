import { generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  checkAllCopies,
  checkFixture,
  FIXTURE_COPIES,
} from '../check-device-signature-fixture.mjs';
import { isFileNotFound } from '../fixture-copies.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

type Fixture = Parameters<typeof checkFixture>[0];

/**
 * Locate a copy by where it lives rather than by position. `FIXTURE_COPIES` is
 * meant to grow — the guard's docblock says a third consumer needs no new code
 * — and an index would quietly start pointing at the wrong copy the day one is
 * added.
 */
function copyUnder(prefix: string) {
  const found = FIXTURE_COPIES.find((copy) => copy.path.startsWith(prefix));
  if (found === undefined) throw new Error(`no device-signature fixture copy under ${prefix}`);
  return found;
}

const canonical = copyUnder('clients/');
const vendored = copyUnder('pillars/bfm/');

/**
 * Reads a committed copy under the same `string | null` contract
 * {@link checkAllCopies} is given in production — `null` means absent, and only
 * absent. It shares the production reader's predicate rather than repeating the
 * errno check, so the two cannot drift into disagreeing about what `null` means:
 * a copy that goes missing fails as the guard's own "missing" message, while a
 * copy that is present but unreadable surfaces the real error instead of being
 * misreported as one that was never there.
 */
const readCommitted = (repoRelativePath: string) => {
  try {
    return readFileSync(join(repoRoot, repoRelativePath), 'utf8');
  } catch (error) {
    if (isFileNotFound(error)) return null;
    throw error;
  }
};

/** The suite cannot run without the canonical copy, so its absence is fatal here. */
function requireCommitted(repoRelativePath: string) {
  const text = readCommitted(repoRelativePath);
  if (text === null) throw new Error(`missing committed fixture copy: ${repoRelativePath}`);
  return text;
}

const committed: Fixture = JSON.parse(requireCommitted(canonical.path));

/**
 * Build a fresh, internally consistent fixture with `node:crypto` alone.
 *
 * The committed vector comes from Swift. Generating an equivalent one here and
 * asserting it also passes is what proves the checker validates the *encodings*
 * rather than having been fitted to one particular set of bytes.
 */
function generateEquivalentFixture(): Fixture {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const message = Buffer.from('a different message entirely');
  const der = sign('sha256', message, { key: privateKey, dsaEncoding: 'der' });
  const raw = sign('sha256', message, { key: privateKey, dsaEncoding: 'ieee-p1363' });
  const jwk = publicKey.export({ format: 'jwk' });

  return {
    version: 1,
    curve: 'P-256',
    digest: 'SHA-256',
    publicKeyEncoding: 'spki-der',
    signatureEncoding: 'asn1-der',
    transportEncoding: 'base64',
    messageBase64: message.toString('base64'),
    publicKeySpkiDerBase64: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    publicKeyX963Base64: Buffer.concat([
      Buffer.from([0x04]),
      Buffer.from(String(jwk.x), 'base64url'),
      Buffer.from(String(jwk.y), 'base64url'),
    ]).toString('base64'),
    signatureDerBase64: der.toString('base64'),
    signatureRawBase64: raw.toString('base64'),
  };
}

describe('the committed fixture', () => {
  it('passes every encoding assertion', () => {
    expect(checkFixture(committed)).toEqual([]);
  });

  it('exists once per consumer, byte-identical', () => {
    expect(FIXTURE_COPIES.length).toBeGreaterThan(1);
    expect(checkAllCopies(readCommitted)).toEqual([]);
  });

  it('is vendored inside every consumer rather than read from clients/ — ADR-043', () => {
    // Exactly one copy may live under `clients/`, and it must be the canonical
    // one the equality check restores from. Every other copy is a consumer's
    // own, which is the whole point of vendoring it.
    const underClients = FIXTURE_COPIES.filter((copy) => copy.path.startsWith('clients/'));

    expect(underClients).toEqual([canonical]);
    expect(FIXTURE_COPIES.length).toBeGreaterThan(underClients.length);
  });

  it('carries a 64-byte raw signature and a 65-byte uncompressed point', () => {
    expect(Buffer.from(committed.signatureRawBase64, 'base64')).toHaveLength(64);
    expect(Buffer.from(committed.publicKeyX963Base64, 'base64')).toHaveLength(65);
    expect(Buffer.from(committed.publicKeyX963Base64, 'base64')[0]).toBe(0x04);
  });
});

describe('checkFixture', () => {
  it('accepts an equivalent vector generated independently by node:crypto', () => {
    expect(checkFixture(generateEquivalentFixture())).toEqual([]);
  });

  it('rejects a signature handed over in raw r‖s where DER is expected', () => {
    const failures = checkFixture({
      ...committed,
      signatureDerBase64: committed.signatureRawBase64,
    });

    expect(failures.join('\n')).toContain('DER signature does not verify');
  });

  it('rejects a public key handed over as an X9.63 point instead of SPKI', () => {
    const failures = checkFixture({
      ...committed,
      publicKeySpkiDerBase64: committed.publicKeyX963Base64,
    });

    expect(failures.join('\n')).toContain('not a parseable SPKI key');
  });

  it('rejects a fixture whose two public key encodings describe different keys', () => {
    const other = generateEquivalentFixture();

    const failures = checkFixture({ ...committed, publicKeyX963Base64: other.publicKeyX963Base64 });

    expect(failures.join('\n')).toContain('not the uncompressed point');
  });

  it('rejects a raw signature that is not the same signature as the DER one', () => {
    const failures = checkFixture({
      ...committed,
      signatureRawBase64: Buffer.alloc(64).toString('base64'),
    });

    expect(failures.join('\n')).toContain('negative control proves nothing');
  });

  it('rejects a fixture that redefines the contract it is meant to pin', () => {
    for (const [field, value] of [
      ['curve', 'P-384'],
      ['digest', 'SHA-512'],
      ['signatureEncoding', 'ieee-p1363'],
      ['publicKeyEncoding', 'x963'],
      ['transportEncoding', 'hex'],
    ] as const) {
      const failures = checkFixture({ ...committed, [field]: value });

      expect(failures.join('\n')).toContain(field);
    }
  });

  it('rejects a key on the wrong curve even when everything else is consistent', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
    const message = Buffer.from('p-384 message');
    const jwk = publicKey.export({ format: 'jwk' });

    const failures = checkFixture({
      ...committed,
      messageBase64: message.toString('base64'),
      publicKeySpkiDerBase64: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
      publicKeyX963Base64: Buffer.concat([
        Buffer.from([0x04]),
        Buffer.from(String(jwk.x), 'base64url'),
        Buffer.from(String(jwk.y), 'base64url'),
      ]).toString('base64'),
      signatureDerBase64: sign('sha256', message, {
        key: privateKey,
        dsaEncoding: 'der',
      }).toString('base64'),
      signatureRawBase64: sign('sha256', message, {
        key: privateKey,
        dsaEncoding: 'ieee-p1363',
      }).toString('base64'),
    });

    expect(failures.join('\n')).toContain('curve is secp384r1');
  });

  it('reports a garbage public key without throwing', () => {
    const failures = checkFixture({
      ...committed,
      publicKeySpkiDerBase64: Buffer.from('not a key at all').toString('base64'),
    });

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('not a parseable SPKI key');
  });
});

describe('checkAllCopies', () => {
  const text = JSON.stringify(committed);
  const identical = new Map(FIXTURE_COPIES.map(({ path }) => [path, text]));
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
    const drifted = JSON.stringify({ ...committed, version: 2 });

    expect(checkAllCopies(withVendored(drifted)).join('\n')).toContain('drifted from');
  });

  it('catches a canonical copy edited on its own', () => {
    const files = new Map(identical).set(
      canonical.path,
      JSON.stringify({ ...committed, version: 2 })
    );

    expect(checkAllCopies(readerOver(files)).join('\n')).toContain('drifted from');
  });

  it('catches a copy that is only reformatted, not semantically changed', () => {
    // Byte-equality is the point: `oxfmt` runs over both copies at commit time,
    // so a copy that survived a different formatter is exactly how they part.
    expect(checkAllCopies(withVendored(JSON.stringify(committed, null, 4))).join('\n')).toContain(
      'drifted from'
    );
  });

  it('catches a missing copy rather than silently checking one', () => {
    expect(checkAllCopies(withVendored(null)).join('\n')).toContain('missing');
  });

  it('reports unparseable JSON against the copy it came from', () => {
    const failures = checkAllCopies(withVendored('{ not json'));

    expect(failures.join('\n')).toContain(vendored.path);
    expect(failures.join('\n')).toContain('not parseable as JSON');
  });

  it('attributes an encoding failure to the copy that carries it', () => {
    const broken = JSON.stringify({
      ...committed,
      signatureDerBase64: committed.signatureRawBase64,
    });

    const failures = checkAllCopies(withVendored(broken));

    expect(failures.some((f) => f.startsWith(`${vendored.path}: `))).toBe(true);
    expect(failures.some((f) => f.startsWith(`${canonical.path}: `))).toBe(false);
  });
});
