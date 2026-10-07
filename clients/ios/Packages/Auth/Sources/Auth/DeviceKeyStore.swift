import Foundation

/// The device's long-lived cryptographic identity.
///
/// One implementation is real (``SecureEnclaveKeyStore``) and one is a fake
/// (`InMemoryKeyStore`, in `AuthTestSupport`). The protocol exists so pairing,
/// refresh and the transport are written against the contract rather than
/// against `SecKey`, and so the fake can never be reached from the app target —
/// see this package's README on why the fake ships in a separate product.
///
/// The private half is created inside the Secure Enclave and is not
/// extractable: not by this app, not by another app, and not by someone holding
/// the unlocked device with a debugger attached. Every claim the auth design
/// makes about a stolen refresh token being useless rests on that one property.
public protocol DeviceKeyStore: Sendable {
    /// Creates the device key.
    ///
    /// - Returns: The public half, in both encodings.
    /// - Throws: ``DeviceKeyStoreError/keyAlreadyExists`` when an active key is
    ///   already present. Pairing uses ``createCandidateKey()`` so a refused
    ///   code does not replace the current identity.
    @discardableResult
    func createKey() throws -> DevicePublicKey

    /// Creates a key that can be used for an exchange without replacing the
    /// active identity.
    func createCandidateKey() throws -> DeviceKeyCandidate

    /// Makes a staged key active. If this throws, the previous active key is
    /// still selected.
    func activateCandidate(_ candidate: DeviceKeyCandidate) throws

    /// Removes a staged key without changing the active identity.
    func discardCandidate(_ candidate: DeviceKeyCandidate) throws

    /// The public half of the existing device key, or `nil` when unpaired.
    func publicKey() throws -> DevicePublicKey?

    /// Signs `message` with the device key.
    ///
    /// - Parameter message: The exact bytes to sign, unhashed. The digest and
    ///   signature encoding are fixed by ``DeviceSignatureContract``.
    /// - Returns: An ASN.1 DER ECDSA signature.
    /// - Throws: ``DeviceKeyStoreError/keyNotFound`` when unpaired.
    func signature(for message: Data) throws -> Data

    /// Removes every key in this store's namespace, including staged keys.
    /// Idempotent: deleting an absent key succeeds.
    ///
    /// Revocation recovery calls this, so it must not fail merely because there
    /// was nothing to delete — a throw there would strand the app holding
    /// credentials it has already been told are dead.
    func deleteKey() throws
}

/// A staged signing key and its public half, safe to retain while pairing is
/// in flight. The identifier cannot be used to export or sign with the key.
public struct DeviceKeyCandidate: Sendable, Equatable {
    /// The public key the BFM stores for the new device identity.
    public let publicKey: DevicePublicKey

    /// Opaque identifier used by the key store to locate the staged key.
    public let identifier: UUID

    /// Non-secret key-store namespace that owns the candidate.
    public let namespace: String

    /// Creates a candidate descriptor. A store still verifies that the
    /// identifier exists in its own namespace before activation or deletion.
    public init(publicKey: DevicePublicKey, identifier: UUID, namespace: String) {
        self.publicKey = publicKey
        self.identifier = identifier
        self.namespace = namespace
    }
}

/// Why a key operation failed.
///
/// No case carries key material, token material or signature bytes; a
/// `localizedDescription` reaching a log must stay useless to whoever reads it.
/// The numeric codes are the exception worth carrying — they are
/// Security-framework error codes, not secrets, and they are the only
/// diagnostics the Enclave path has: `-25293` (device locked) and `-26275`
/// (no Enclave) are the same failure without them.
public enum DeviceKeyStoreError: Error, Equatable {
    /// A device key is already present. Delete it before creating another.
    case keyAlreadyExists

    /// A staged key no longer exists or belongs to another store.
    case candidateNotFound

    /// A staged key has already become the active identity.
    case candidateAlreadyActive

    /// No device key is present — the device is unpaired.
    case keyNotFound

    /// The stored bytes are not a well-formed uncompressed P-256 point or SPKI key.
    case malformedPublicKey

    /// The Secure Enclave refused to produce a key. Simulators and Macs without
    /// the hardware land here, and so does a device whose Enclave is unavailable.
    case secureEnclaveUnavailable(code: Int)

    /// The Keychain rejected the operation.
    case keychain(OSStatus)

    /// The Enclave declined to sign. Most often a device locked between the
    /// decision to refresh and the signature.
    case signingFailed(code: Int)
}

extension DeviceKeyStoreError: CustomStringConvertible {
    public var description: String {
        switch self {
        case .keyAlreadyExists: "a device key already exists"
        case .candidateNotFound: "no staged device key"
        case .candidateAlreadyActive: "the staged device key is active"
        case .keyNotFound: "no device key"
        case .malformedPublicKey: "malformed P-256 public key"
        case .secureEnclaveUnavailable(let code): "secure enclave unavailable (\(code))"
        case .keychain(let status): "keychain error \(status)"
        case .signingFailed(let code): "secure enclave declined to sign (\(code))"
        }
    }
}
