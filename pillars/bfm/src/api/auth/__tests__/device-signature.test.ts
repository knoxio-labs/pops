/**
 * The BFM half of the iOS↔BFM encoding contract, asserted against the vector
 * vendored into this pillar at `pillars/bfm/contracts/device-signature-v1.json`.
 *
 * The vector was generated on the Swift side by a real P-256 key, so these
 * tests are the only thing in this repo that proves `node:crypto` accepts what
 * CryptoKit produces. Everything else about refresh can be exercised with keys
 * this process generated itself, which would agree with the verifier by
 * construction and prove nothing about the phone.
 *
 * The copy read here is this pillar's own. `clients/ios` holds the canonical
 * one and asserts it from Swift; `scripts/ci/check-device-signature-fixture.mjs`
 * fails the build if the two ever differ by a byte.
 */
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  DEVICE_KEY_CURVE,
  DEVICE_SIGNATURE_DIGEST,
  DEVICE_SIGNATURE_ENCODING,
  DevicePublicKeyError,
  parseDevicePublicKey,
  verifyDeviceSignature,
} from '../device-signature.js';

interface DeviceSignatureFixture {
  version: number;
  curve: string;
  digest: string;
  publicKeyEncoding: string;
  signatureEncoding: string;
  transportEncoding: string;
  messageBase64: string;
  publicKeySpkiDerBase64: string;
  publicKeyX963Base64: string;
  signatureDerBase64: string;
  signatureRawBase64: string;
}

const pillarRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

/** This pillar's vendored copy. Never the one under `clients/` — see ADR-043. */
const fixturePath = join(pillarRoot, 'contracts', 'device-signature-v1.json');

const fixture: DeviceSignatureFixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

const message = Buffer.from(fixture.messageBase64, 'base64');
const derSignature = Buffer.from(fixture.signatureDerBase64, 'base64');
const rawSignature = Buffer.from(fixture.signatureRawBase64, 'base64');

/** A P-256 keypair this process owns, for the wrong-signer cases. */
function otherKeyPair() {
  return generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
}

describe('the vendored fixture', () => {
  it('still declares the contract this module was written against', () => {
    // The fixture is a pin, so it must not be able to redefine itself: a vector
    // regenerated under different encodings would otherwise pass every
    // signature assertion below while silently moving the contract.
    expect(fixture).toMatchObject({
      version: 1,
      curve: 'P-256',
      digest: 'SHA-256',
      publicKeyEncoding: 'spki-der',
      signatureEncoding: 'asn1-der',
      transportEncoding: 'base64',
    });
  });

  it('carries a 64-byte raw signature and a 65-byte uncompressed point', () => {
    expect(rawSignature).toHaveLength(64);
    expect(Buffer.from(fixture.publicKeyX963Base64, 'base64')).toHaveLength(65);
    expect(Buffer.from(fixture.publicKeyX963Base64, 'base64')[0]).toBe(0x04);
  });
});

describe('parseDevicePublicKey', () => {
  it('decodes the SPKI the pairing exchange stores, on the expected curve', () => {
    const key = parseDevicePublicKey(fixture.publicKeySpkiDerBase64);

    expect(key.asymmetricKeyType).toBe('ec');
    expect(key.asymmetricKeyDetails?.namedCurve).toBe(DEVICE_KEY_CURVE);
  });

  it('decodes to the same point the Secure Enclave exports as X9.63', () => {
    const jwk = parseDevicePublicKey(fixture.publicKeySpkiDerBase64).export({ format: 'jwk' });

    const uncompressed = Buffer.concat([
      Buffer.from([0x04]),
      Buffer.from(String(jwk.x), 'base64url'),
      Buffer.from(String(jwk.y), 'base64url'),
    ]);

    expect(uncompressed.toString('base64')).toBe(fixture.publicKeyX963Base64);
  });

  it('accepts the same key in base64url, which decodes to the same bytes', () => {
    // Documented rather than enforced: Node normalises `-`/`_`, so an alphabet
    // check would reject a value that decodes to exactly the right key. The
    // docblock says so; this is what stops that from being only a comment.
    const asBase64Url = Buffer.from(fixture.publicKeySpkiDerBase64, 'base64').toString('base64url');

    expect(asBase64Url).not.toBe(fixture.publicKeySpkiDerBase64);
    expect(
      parseDevicePublicKey(asBase64Url).export({ format: 'der', type: 'spki' }).toString('base64')
    ).toBe(fixture.publicKeySpkiDerBase64);
  });

  it('rejects the X9.63 point handed over where SPKI is expected', () => {
    expect(() => parseDevicePublicKey(fixture.publicKeyX963Base64)).toThrow(DevicePublicKeyError);
  });

  it('rejects a key on another curve rather than letting verification decide', () => {
    const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
    const spki = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');

    expect(() => parseDevicePublicKey(spki)).toThrow(/expected prime256v1/);
  });

  it('rejects an RSA key', () => {
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const spki = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');

    expect(() => parseDevicePublicKey(spki)).toThrow(/expected ec/);
  });

  it('rejects bytes that are not a key at all', () => {
    expect(() => parseDevicePublicKey(Buffer.from('nonsense').toString('base64'))).toThrow(
      DevicePublicKeyError
    );
  });
});

describe('verifyDeviceSignature', () => {
  const key = parseDevicePublicKey(fixture.publicKeySpkiDerBase64);

  it('verifies a signature CryptoKit produced', () => {
    expect(verifyDeviceSignature(key, message, derSignature)).toBe(true);
  });

  it('rejects the same signature in raw r‖s', () => {
    // The negative control. Without it, "we chose DER" is a claim no test can
    // fail on: a verifier that accepted both encodings would pass every other
    // assertion in this file.
    expect(verifyDeviceSignature(key, message, rawSignature)).toBe(false);
  });

  it('rejects a message that differs by one byte', () => {
    expect(
      verifyDeviceSignature(key, Buffer.concat([message, Buffer.from('!')]), derSignature)
    ).toBe(false);
  });

  it('rejects a valid signature made by a different device', () => {
    const { privateKey, publicKey } = otherKeyPair();
    const theirSignature = sign(DEVICE_SIGNATURE_DIGEST, message, {
      key: privateKey,
      dsaEncoding: DEVICE_SIGNATURE_ENCODING,
    });
    const theirKey = parseDevicePublicKey(
      publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
    );

    expect(verifyDeviceSignature(theirKey, message, theirSignature)).toBe(true);
    expect(verifyDeviceSignature(key, message, theirSignature)).toBe(false);
    expect(verifyDeviceSignature(theirKey, message, derSignature)).toBe(false);
  });

  it('returns false on malformed signature bytes instead of throwing', () => {
    for (const garbage of [
      Buffer.alloc(0),
      Buffer.from('not der at all'),
      Buffer.alloc(72, 0xff),
    ]) {
      expect(verifyDeviceSignature(key, message, garbage)).toBe(false);
    }
  });

  it('accepts a fresh signature over the fixture message from a key it was told about', () => {
    // Proves the verifier checks the encoding rather than having been fitted to
    // one particular set of committed bytes: a signature generated here, by
    // node itself, has to pass the same path the Swift-generated one does.
    const { privateKey, publicKey } = otherKeyPair();
    const spki = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');

    expect(
      verifyDeviceSignature(
        parseDevicePublicKey(spki),
        message,
        sign(DEVICE_SIGNATURE_DIGEST, message, {
          key: privateKey,
          dsaEncoding: DEVICE_SIGNATURE_ENCODING,
        })
      )
    ).toBe(true);
  });
});
