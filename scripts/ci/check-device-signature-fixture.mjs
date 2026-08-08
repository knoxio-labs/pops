#!/usr/bin/env node
/**
 * Device-signature encoding guard — the Node half.
 *
 * The iOS app signs a refresh request with a P-256 key held in the phone's
 * Secure Enclave, and the BFM verifies that signature with `node:crypto`. Two
 * encodings have to agree for that to work and neither side defaults to the
 * other's choice:
 *
 *   - the signature bytes: ASN.1 DER (what `SecKeyCreateSignature` emits and
 *     what `node:crypto` verifies by default) versus raw `r‖s`;
 *   - the public key bytes: SPKI DER (what the pairing request carries) versus
 *     the X9.63 uncompressed point the Secure Enclave actually hands over.
 *
 * A mismatch on either is indistinguishable, from both logs, from an expired
 * or wrong token: the request simply 401s. So the choice is pinned by a
 * committed fixture — `clients/ios/Contracts/device-signature-v1.json`, a real
 * key, a real message and a real signature produced on the Swift side — and
 * asserted from both languages. This script is the Node assertion. The Swift
 * one is `DeviceSignatureFixtureTests` in `clients/ios/Packages/Auth`.
 *
 * Reading a file under `clients/` is not a dependency on the client in the
 * ADR-043 sense: nothing here imports it, links it or ships it, and this guard
 * exists precisely so the client and its pillar cannot drift apart. When the
 * BFM lands it vendors its own copy of the fixture inside its unit boundary,
 * the way every other cross-unit contract in this repo is handled.
 *
 * The negative controls are the part that carries the weight. Asserting only
 * that the DER signature verifies would also pass if a future change made the
 * verifier accept anything, so the check also proves that the raw `r‖s`
 * encoding of the SAME signature is rejected by a DER verifier and accepted by
 * an `ieee-p1363` one. That is what makes "we chose DER" a fact a test can
 * fail on rather than a sentence in a comment.
 *
 * Usage:
 *   node scripts/ci/check-device-signature-fixture.mjs
 *   node scripts/ci/check-device-signature-fixture.mjs --self-test
 *
 * Exit 0 = the fixture verifies and every encoding assertion holds.
 */

import { createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

const FIXTURE_PATH = join(repoRoot, 'clients', 'ios', 'Contracts', 'device-signature-v1.json');

/** The encoding contract, restated here so the fixture cannot redefine itself. */
const CONTRACT = Object.freeze({
  version: 1,
  curve: 'P-256',
  digest: 'SHA-256',
  publicKeyEncoding: 'spki-der',
  signatureEncoding: 'asn1-der',
  transportEncoding: 'base64',
});

/** OpenSSL's name for P-256, as `KeyObject.asymmetricKeyDetails` reports it. */
const OPENSSL_CURVE = 'prime256v1';

/** `node:crypto` digest name for {@link CONTRACT.digest}. */
const DIGEST = 'sha256';

/**
 * @typedef {object} Fixture
 * @property {number} version
 * @property {string} curve
 * @property {string} digest
 * @property {string} publicKeyEncoding
 * @property {string} signatureEncoding
 * @property {string} transportEncoding
 * @property {string} messageBase64
 * @property {string} publicKeySpkiDerBase64
 * @property {string} publicKeyX963Base64
 * @property {string} signatureDerBase64
 * @property {string} signatureRawBase64
 */

/**
 * Rebuild the X9.63 uncompressed point (`0x04 ‖ X ‖ Y`) from a public key, so
 * the SPKI the BFM stores can be compared against the bytes the Secure Enclave
 * exports. Going through JWK is the only route `node:crypto` offers to the
 * raw coordinates.
 *
 * @param {import('node:crypto').KeyObject} key
 * @returns {Buffer}
 */
function x963FromPublicKey(key) {
  const jwk = key.export({ format: 'jwk' });
  if (typeof jwk.x !== 'string' || typeof jwk.y !== 'string') {
    throw new Error('public key JWK carries no EC coordinates');
  }
  return Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(jwk.x, 'base64url'),
    Buffer.from(jwk.y, 'base64url'),
  ]);
}

/**
 * Run every assertion against a parsed fixture.
 *
 * Pure and dependency-free so the self-test can drive it with a deliberately
 * corrupted fixture and observe it fail.
 *
 * @param {Fixture} fixture
 * @returns {string[]} One message per failed assertion; empty means the fixture holds.
 */
export function checkFixture(fixture) {
  /** @type {string[]} */
  const failures = [];

  for (const [field, expected] of Object.entries(CONTRACT)) {
    const actual = fixture[/** @type {keyof CONTRACT} */ (field)];
    if (actual !== expected) {
      failures.push(
        `${field}: fixture says ${JSON.stringify(actual)}, contract says ${JSON.stringify(expected)}`
      );
    }
  }

  const message = Buffer.from(fixture.messageBase64, 'base64');
  const spki = Buffer.from(fixture.publicKeySpkiDerBase64, 'base64');
  const derSignature = Buffer.from(fixture.signatureDerBase64, 'base64');
  const rawSignature = Buffer.from(fixture.signatureRawBase64, 'base64');

  /** @type {import('node:crypto').KeyObject | null} */
  let publicKey = null;
  try {
    publicKey = createPublicKey({ key: spki, format: 'der', type: 'spki' });
  } catch (error) {
    failures.push(`publicKeySpkiDerBase64 is not a parseable SPKI key: ${String(error)}`);
  }

  if (publicKey === null) return failures;

  if (publicKey.asymmetricKeyType !== 'ec') {
    failures.push(`public key is ${publicKey.asymmetricKeyType}, expected ec`);
  }
  const namedCurve = publicKey.asymmetricKeyDetails?.namedCurve;
  if (namedCurve !== OPENSSL_CURVE) {
    failures.push(`public key curve is ${namedCurve}, expected ${OPENSSL_CURVE}`);
  }

  const x963 = x963FromPublicKey(publicKey);
  if (!x963.equals(Buffer.from(fixture.publicKeyX963Base64, 'base64'))) {
    failures.push(
      'publicKeyX963Base64 is not the uncompressed point of publicKeySpkiDerBase64 — ' +
        'the SPKI wrapping the app performs does not round-trip'
    );
  }
  if (rawSignature.length !== 64) {
    failures.push(`signatureRawBase64 is ${rawSignature.length} bytes, expected 64 (r‖s on P-256)`);
  }

  if (!verify(DIGEST, message, { key: publicKey, dsaEncoding: 'der' }, derSignature)) {
    failures.push('the DER signature does not verify — the encoding contract is already broken');
  }

  // Negative controls. Each of these passing would mean the guard cannot tell
  // the two encodings apart, which is the entire failure it exists to catch.
  if (verify(DIGEST, message, { key: publicKey, dsaEncoding: 'der' }, rawSignature)) {
    failures.push(
      'a raw r‖s signature was accepted by a DER verifier — the encodings are not being distinguished'
    );
  }
  if (!verify(DIGEST, message, { key: publicKey, dsaEncoding: 'ieee-p1363' }, rawSignature)) {
    failures.push(
      'signatureRawBase64 is not the raw encoding of signatureDerBase64 — the negative control proves nothing'
    );
  }
  const tampered = Buffer.concat([message, Buffer.from('!')]);
  if (verify(DIGEST, tampered, { key: publicKey, dsaEncoding: 'der' }, derSignature)) {
    failures.push('a modified message verified against the committed signature');
  }

  return failures;
}

/**
 * Self-test: prove the assertions actually fail on a fixture that has been
 * broken in each of the ways this guard exists to catch. A guard nobody has
 * watched fail is a guard nobody knows works.
 *
 * @param {Fixture} valid A fixture already known to pass.
 * @returns {boolean}
 */
function selfTest(valid) {
  /** @type {[string, Fixture][]} */
  const corruptions = [
    [
      'signature swapped for its raw r‖s form',
      { ...valid, signatureDerBase64: valid.signatureRawBase64 },
    ],
    [
      'public key swapped for its X9.63 form',
      { ...valid, publicKeySpkiDerBase64: valid.publicKeyX963Base64 },
    ],
    ['message altered', { ...valid, messageBase64: Buffer.from('different').toString('base64') }],
    ['contract metadata drifted', { ...valid, signatureEncoding: 'ieee-p1363' }],
    [
      'raw signature no longer matches the DER one',
      { ...valid, signatureRawBase64: Buffer.alloc(64).toString('base64') },
    ],
  ];

  let ok = checkFixture(valid).length === 0;
  if (!ok) console.error('SELF-TEST FAILED: the committed fixture does not pass its own checks');

  for (const [label, corrupted] of corruptions) {
    const caught = checkFixture(corrupted).length > 0;
    if (!caught) {
      console.error(`SELF-TEST FAILED: not caught — ${label}`);
      ok = false;
    }
  }

  if (ok) {
    console.log(
      `self-test OK — accepts the fixture, rejects ${corruptions.length} corruptions of it.`
    );
  }
  return ok;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('Usage: node scripts/ci/check-device-signature-fixture.mjs [--self-test]');
    process.exit(2);
  }

  /** @type {Fixture} */
  let fixture;
  try {
    fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
  } catch (error) {
    console.error(`FAIL — cannot read ${FIXTURE_PATH}: ${String(error)}`);
    process.exit(1);
  }

  if (argv.includes('--self-test')) {
    process.exit(selfTest(fixture) ? 0 : 1);
  }

  const failures = checkFixture(fixture);
  if (failures.length === 0) {
    console.log('OK — the device-signature fixture verifies under node:crypto, DER end to end.');
    process.exit(0);
  }

  console.error(`FAIL — ${failures.length} device-signature encoding problem(s):`);
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(
    '\nThe iOS app and the BFM must agree on ECDSA P-256 encodings. Regenerate the ' +
      'fixture with clients/ios/Tools/generate-device-signature-fixture.swift only if ' +
      'the contract itself changed, and update both sides’ assertions together.'
  );
  process.exit(1);
}

main();
