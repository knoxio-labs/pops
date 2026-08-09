import CryptoKit
import Foundation

/// The exact bytes a refresh is signed over.
///
/// This is one half of a contract no compiler can check. The other half is
/// `refreshSignatureMessage()` in `pillars/bfm/src/api/auth/refresh-exchange.ts`,
/// whose file header is the format's only definition, and the BFM is the party
/// that rejects a wrong one. A disagreement of a single byte produces a
/// signature that does not verify, which reaches this app as a `401`
/// indistinguishable from an expired token — so the failure looks like a
/// credential problem and sends whoever is debugging it to the wrong place
/// entirely.
///
/// ```
/// BFM-REFRESH-V1\n<nonce>\n<sha256(refreshToken), lowercase hex>
/// ```
///
/// UTF-8, exactly two `\n`, and **no trailing newline**.
///
/// Two details are worth restating here because they are the ones a
/// well-meaning edit would get wrong:
///
/// - **The digest, not the token.** The preimage never carries the secret, so
///   anything that logs or traces what was signed cannot leak the credential.
///   That property is the reason to resist "simplifying" this to sign the token
///   directly. It is also the value the server already computed to find the
///   row, so there is one derivation rather than two that can disagree.
/// - **Lowercase hex.** `hashRefreshToken` on the far side returns Node's
///   default `digest('hex')`, which is lowercase. Uppercase here would be a
///   different string and therefore a different signature.
///
/// The encodings around this — P-256, SHA-256, DER, base64 — are
/// ``DeviceSignatureContract``'s and are pinned by a committed fixture.
/// This type fixes only the bytes those encodings are applied to.
public enum RefreshSignatureMessage {
    /// Domain separation, and a version.
    ///
    /// The Enclave key signs for one purpose today. The moment it signs for a
    /// second, a signature harvested from one context must not be replayable in
    /// the other — a prefix costs nothing now and cannot be added later without
    /// a flag day. Changing this value invalidates every paired device in the
    /// field, because a shipped build cannot be rolled forward.
    public static let domain = "BFM-REFRESH-V1"

    /// - Parameters:
    ///   - nonce: From `POST /devices/challenge`, verbatim. Opaque; folding it
    ///     in is the only valid thing to do with it.
    ///   - refreshToken: The token about to be spent. Hashed here, never sent
    ///     in these bytes.
    /// - Returns: The message to sign, unhashed — ``DeviceKeyStore/signature(for:)``
    ///   applies SHA-256 itself.
    public static func bytes(nonce: String, refreshToken: String) -> Data {
        Data("\(domain)\n\(nonce)\n\(hexDigest(of: refreshToken))".utf8)
    }

    private static func hexDigest(of refreshToken: String) -> String {
        SHA256.hash(data: Data(refreshToken.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }
}
