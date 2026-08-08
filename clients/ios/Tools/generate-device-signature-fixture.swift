#!/usr/bin/env swift
//
// Regenerates clients/ios/Contracts/device-signature-v1.json.
//
// Run this only when the encoding contract itself changes — the fixture is a
// pinned artefact, not a build output. ECDSA signing draws a fresh nonce every
// time, so every run produces different signature bytes; re-running for no
// reason replaces a reviewed, cross-verified vector with an unreviewed one and
// tells the reviewer nothing.
//
// The key is an ordinary software P-256 key rather than a Secure Enclave one,
// and deliberately so: an Enclave key is non-extractable, so no fixture could
// ever be generated from one, and the encodings are identical either way. What
// the fixture pins is the wire format, which is the part the two ends can
// disagree about.
//
// Usage, from clients/ios:
//   swift Tools/generate-device-signature-fixture.swift > Contracts/device-signature-v1.json
//
// Then run `oxfmt --write` over the result, and re-run the Swift and Node
// assertions before committing.

import CryptoKit
import Foundation

let message = Data(
    "pops/device-signature/v1 encoding fixture — opaque bytes, not the refresh message format"
        .utf8
)

let privateKey = P256.Signing.PrivateKey()
let signature = try privateKey.signature(for: message)

let fixture: [String: Any] = [
    "version": 1,
    "note":
        "Pins the ECDSA P-256 encodings the iOS app produces and the BFM verifies. "
        + "Both sides assert against this file. The message bytes are opaque: the "
        + "refresh message format is the BFM's to define.",
    "curve": "P-256",
    "digest": "SHA-256",
    "publicKeyEncoding": "spki-der",
    "signatureEncoding": "asn1-der",
    "transportEncoding": "base64",
    "messageBase64": message.base64EncodedString(),
    "publicKeySpkiDerBase64": privateKey.publicKey.derRepresentation.base64EncodedString(),
    "publicKeyX963Base64": privateKey.publicKey.x963Representation.base64EncodedString(),
    "signatureDerBase64": signature.derRepresentation.base64EncodedString(),
    // The same signature in raw r‖s. Present as a negative control: a verifier
    // configured for DER must reject it. Without it, "we chose DER" is a claim
    // no test can fail on.
    "signatureRawBase64": signature.rawRepresentation.base64EncodedString(),
]

let json = try JSONSerialization.data(
    withJSONObject: fixture,
    options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
)
FileHandle.standardOutput.write(json)
FileHandle.standardOutput.write(Data("\n".utf8))
