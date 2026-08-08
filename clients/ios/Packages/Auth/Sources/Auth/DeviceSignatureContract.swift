import Foundation

/// The encoding half of the device-signature contract, settled once here.
///
/// The BFM verifies these signatures with `node:crypto`. CryptoKit
/// and `node:crypto` both speak ECDSA P-256 and neither defaults to the other's
/// encoding for free, so the pair has to be pinned deliberately:
///
/// | Concern           | Chosen                            | Why this one                                                                                                                              |
/// | ----------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
/// | Curve             | P-256 (`secp256r1`, `prime256v1`) | The only curve the Secure Enclave generates.                                                                                              |
/// | Digest            | SHA-256                           | Paired with P-256 by `kSecKeyAlgorithmECDSASignatureMessageX962SHA256`, and the only digest the Enclave's message-signing variants offer.  |
/// | Signature bytes   | ASN.1 DER (X9.62)                 | What `SecKeyCreateSignature` emits, and `node:crypto`'s default `dsaEncoding`. Choosing raw `r‖s` would mean both ends converting instead of neither. |
/// | Public key bytes  | SPKI DER                          | `node:crypto`'s `createPublicKey` reads it with no out-of-band curve hint. The Enclave only offers X9.63, so the app converts — see ``DevicePublicKey``. |
/// | Transport         | base64                            | Both sides of the pairing and refresh payloads are JSON.                                                                                  |
///
/// A mismatch on any row surfaces as an ordinary 401 with nothing in either
/// log to distinguish it from a wrong token, which is why the choice is
/// asserted against a committed fixture on both sides rather than only written
/// down. See `clients/ios/Contracts/device-signature-v1.json`.
///
/// The *content* of the signed message — how a nonce and a refresh token are
/// bound together into bytes — is deliberately not here. That format is the
/// BFM's to define, because the server is the party that rejects a wrong one;
/// this type fixes only how the resulting bytes are encoded.
public enum DeviceSignatureContract {
    /// Fixture and contract revision. Bumping it is a breaking change for every
    /// paired device, since a shipped build cannot be rolled forward.
    public static let version = 1

    /// JOSE-style curve name, as the fixture records it.
    public static let curve = "P-256"

    /// Digest applied to the message before signing.
    public static let digest = "SHA-256"

    /// Signature encoding: ASN.1 DER `SEQUENCE { r INTEGER, s INTEGER }`.
    public static let signatureEncoding = "asn1-der"

    /// Public key encoding: `SubjectPublicKeyInfo`, DER.
    public static let publicKeyEncoding = "spki-der"

    /// How both encodings are carried in JSON.
    public static let transportEncoding = "base64"
}
