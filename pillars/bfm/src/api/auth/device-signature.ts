/**
 * Proof of possession, at the level of bytes: decoding a paired device's
 * public key, and checking a signature it claims to have produced.
 *
 * The phone signs with a P-256 key held in its Secure Enclave, and this is the
 * only place the resulting bytes are interpreted. Two encodings have to agree
 * for that to work and neither runtime defaults to the other's choice:
 *
 *   - **the signature** is ASN.1 DER — what CryptoKit's `derRepresentation`
 *     emits and what `node:crypto` verifies by default — not the raw `r‖s`
 *     that `rawRepresentation` hands over;
 *   - **the public key** is SPKI DER — what the pairing request carries and
 *     what `devices.public_key_der` stores, base64'd — not the X9.63
 *     uncompressed point the Enclave itself exports.
 *
 * Get either wrong and the failure is a signature that does not verify, which
 * reaches the operator as a 401 indistinguishable from a wrong or expired
 * token. So the choice is not restated in prose here: it is pinned by
 * `pillars/bfm/contracts/device-signature-v1.json`, a real key, message and
 * signature generated on the Swift side and vendored into this pillar, which
 * this module's tests verify against. `clients/ios` asserts the same vector
 * from Swift, and a CI guard fails the build if the two copies drift.
 *
 * What is deliberately NOT here: the refresh message format — what the phone
 * puts in front of the nonce and the refresh token before signing. That is the
 * BFM's to define and it belongs with the route that consumes it (POPS-1375).
 * This module takes opaque bytes.
 */
import { createPublicKey, verify, type KeyObject } from 'node:crypto';

/** OpenSSL's name for P-256, as `KeyObject.asymmetricKeyDetails` reports it. */
export const DEVICE_KEY_CURVE = 'prime256v1' as const;

/** The digest half of the contract, in `node:crypto`'s spelling. */
export const DEVICE_SIGNATURE_DIGEST = 'sha256' as const;

/**
 * The signature encoding, passed explicitly on every call rather than left to
 * the default. `der` IS the default today, which is exactly why naming it
 * matters: a default is a thing that can change under you, and the one call
 * site that forgot to name it would fail only against a real handset.
 */
export const DEVICE_SIGNATURE_ENCODING = 'der' as const;

export class DevicePublicKeyError extends Error {
  override readonly name = 'DevicePublicKeyError' as const;
}

/**
 * Decode the base64 SPKI/DER public key stored in `devices.public_key_der`.
 *
 * Rejecting a key on the wrong curve here, rather than letting verification
 * decide, is the point of the function. `crypto.verify` is happy to check a
 * P-384 signature against a P-384 key: without this, a device that paired with
 * a key from some other curve would still authenticate, and the contract the
 * fixture pins would be true only by convention.
 *
 * @param publicKeyDerBase64 Standard-alphabet base64 (not base64url), as the
 * pairing exchange stores it.
 * @throws {DevicePublicKeyError} when the value is not parseable as SPKI, is
 * not an EC key, or is not on P-256.
 */
export function parseDevicePublicKey(publicKeyDerBase64: string): KeyObject {
  let key: KeyObject;
  try {
    key = createPublicKey({
      key: Buffer.from(publicKeyDerBase64, 'base64'),
      format: 'der',
      type: 'spki',
    });
  } catch (error) {
    throw new DevicePublicKeyError(
      '[bfm-api] device public key is not a parseable SPKI/DER key: ' +
        (error instanceof Error ? error.message : String(error))
    );
  }

  if (key.asymmetricKeyType !== 'ec') {
    throw new DevicePublicKeyError(
      `[bfm-api] device public key is ${String(key.asymmetricKeyType)}, expected ec`
    );
  }
  const namedCurve = key.asymmetricKeyDetails?.namedCurve;
  if (namedCurve !== DEVICE_KEY_CURVE) {
    throw new DevicePublicKeyError(
      `[bfm-api] device public key is on ${String(namedCurve)}, expected ${DEVICE_KEY_CURVE}`
    );
  }
  return key;
}

/**
 * Check an ECDSA P-256 signature over `message` against a paired device's key.
 *
 * Returns `false` rather than throwing on malformed signature bytes. Every
 * input here arrives from the network, so a caller who can post 40 arbitrary
 * bytes must not be able to choose between a 401 and a 500 — and there is
 * nothing an operator could do differently about "the signature was garbage"
 * versus "the signature was well-formed and wrong". Both mean: not this
 * device.
 *
 * @param publicKey From {@link parseDevicePublicKey}, so the curve is already
 * known to be P-256.
 * @param message The exact bytes the phone signed.
 * @param signatureDer ASN.1 DER, decoded from the request's base64.
 */
export function verifyDeviceSignature(
  publicKey: KeyObject,
  message: Buffer,
  signatureDer: Buffer
): boolean {
  try {
    return verify(
      DEVICE_SIGNATURE_DIGEST,
      message,
      { key: publicKey, dsaEncoding: DEVICE_SIGNATURE_ENCODING },
      signatureDer
    );
  } catch {
    return false;
  }
}
