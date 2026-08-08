import CryptoKit
import Foundation

/// The device's P-256 public half, carried in both encodings that matter.
///
/// Two encodings exist because the two ends of the pairing exchange speak
/// different ones and neither can be changed:
///
/// - **X9.63** (`0x04 ‖ X ‖ Y`, 65 bytes) is what `SecKeyCopyExternalRepresentation`
///   returns for a Secure Enclave key. It is the only form the Enclave offers.
/// - **SPKI/DER** is what the BFM stores and what `node:crypto`'s
///   `createPublicKey` accepts without being told the curve. It is the form on
///   the wire.
///
/// Doing the conversion in one place, tested against a committed fixture, is
/// the point of this type: an SPKI header assembled by hand at each call site
/// is how the two ends end up disagreeing about a byte and failing as a 401.
public struct DevicePublicKey: Sendable, Equatable {
    /// `0x04 ‖ X ‖ Y` — the uncompressed point, as the Secure Enclave hands it over.
    public let x963Representation: Data

    /// SubjectPublicKeyInfo DER — the encoding `POST /devices/pair` carries.
    public let derRepresentation: Data

    /// Base64 of ``derRepresentation``, which is how the pairing request serialises it.
    public var base64EncodedDER: String { derRepresentation.base64EncodedString() }

    /// Builds from the Enclave's native encoding, rejecting anything that is
    /// not a point on P-256.
    ///
    /// - Parameter x963Representation: `0x04 ‖ X ‖ Y`, 65 bytes.
    /// - Throws: ``DeviceKeyStoreError/malformedPublicKey`` if the bytes are not
    ///   a well-formed uncompressed P-256 point.
    public init(x963Representation: Data) throws {
        guard let key = try? P256.Signing.PublicKey(x963Representation: x963Representation) else {
            throw DeviceKeyStoreError.malformedPublicKey
        }
        self.x963Representation = key.x963Representation
        derRepresentation = key.derRepresentation
    }

    /// Builds from the wire encoding, for the tests and tooling that start there.
    ///
    /// - Parameter derRepresentation: SubjectPublicKeyInfo DER.
    /// - Throws: ``DeviceKeyStoreError/malformedPublicKey`` if the bytes are not
    ///   a well-formed P-256 SPKI key.
    public init(derRepresentation: Data) throws {
        guard let key = try? P256.Signing.PublicKey(derRepresentation: derRepresentation) else {
            throw DeviceKeyStoreError.malformedPublicKey
        }
        x963Representation = key.x963Representation
        self.derRepresentation = key.derRepresentation
    }

    /// Verifies a signature produced by the matching private half.
    ///
    /// The app has no reason to verify its own signatures in production — this
    /// exists so the test suite and the fixture generator check the encoding
    /// contract end to end rather than asserting on byte lengths.
    ///
    /// - Parameters:
    ///   - signature: ASN.1 DER ECDSA signature, per ``DeviceSignatureContract``.
    ///   - message: The exact bytes that were signed, unhashed.
    /// - Returns: `true` when the signature is valid for this key and message.
    public func isValidSignature(_ signature: Data, for message: Data) -> Bool {
        guard let key = try? P256.Signing.PublicKey(derRepresentation: derRepresentation),
            let parsed = try? P256.Signing.ECDSASignature(derRepresentation: signature)
        else {
            return false
        }
        return key.isValidSignature(parsed, for: message)
    }
}
