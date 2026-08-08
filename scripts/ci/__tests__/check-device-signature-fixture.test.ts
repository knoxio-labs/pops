import { generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { checkFixture } from '../check-device-signature-fixture.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

type Fixture = Parameters<typeof checkFixture>[0];

const committed: Fixture = JSON.parse(
  readFileSync(join(repoRoot, 'clients', 'ios', 'Contracts', 'device-signature-v1.json'), 'utf8')
);

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
