import Auth
import CryptoKit
import Foundation
import Synchronization

/// A ``DeviceKeyStore`` backed by an ordinary software P-256 key.
///
/// It really signs, so a test can exercise create → sign → verify → delete
/// rather than asserting on call counts. What it does not do is protect
/// anything: the private key is in this process's heap, extractable by anyone
/// who can read it, and gone when the process exits.
///
/// That is why it lives in `AuthTestSupport` and not in `Auth`. The app target
/// depends on `Auth` alone, so there is no import that would let this type be
/// wired into the composition root by mistake — and a mistake there would be
/// silent, producing an app that pairs, works, and provides none of the
/// guarantees the pairing was for.
public final class InMemoryKeyStore: DeviceKeyStore {
    private let namespace = UUID().uuidString
    private let key = Mutex<State>(State())

    public init() {}

    /// Number of staged keys that have not been activated or discarded.
    public var stagedCandidateCount: Int { key.withLock { $0.candidates.count } }

    @discardableResult
    public func createKey() throws -> DevicePublicKey {
        try key.withLock { state in
            guard state.active == nil else { throw DeviceKeyStoreError.keyAlreadyExists }
            let generated = P256.Signing.PrivateKey()
            state.active = ActiveKey(identifier: nil, privateKey: generated)
            return try DevicePublicKey(x963Representation: generated.publicKey.x963Representation)
        }
    }

    public func createCandidateKey() throws -> DeviceKeyCandidate {
        try key.withLock { state in
            let generated = P256.Signing.PrivateKey()
            let identifier = UUID()
            state.candidates[identifier] = generated
            let publicKey = try DevicePublicKey(
                x963Representation: generated.publicKey.x963Representation)
            return DeviceKeyCandidate(
                publicKey: publicKey,
                identifier: identifier,
                namespace: namespace
            )
        }
    }

    public func activateCandidate(_ candidate: DeviceKeyCandidate) throws {
        try key.withLock { state in
            guard candidate.namespace == namespace,
                let privateKey = state.candidates.removeValue(forKey: candidate.identifier)
            else {
                throw DeviceKeyStoreError.candidateNotFound
            }
            state.active = ActiveKey(identifier: candidate.identifier, privateKey: privateKey)
        }
    }

    public func discardCandidate(_ candidate: DeviceKeyCandidate) throws {
        try key.withLock { state in
            guard candidate.namespace == namespace else {
                throw DeviceKeyStoreError.candidateNotFound
            }
            guard state.active?.identifier != candidate.identifier else {
                throw DeviceKeyStoreError.candidateAlreadyActive
            }
            state.candidates.removeValue(forKey: candidate.identifier)
        }
    }

    public func publicKey() throws -> DevicePublicKey? {
        try key.withLock { state in
            guard let privateKey = state.active?.privateKey else { return nil }
            return try DevicePublicKey(x963Representation: privateKey.publicKey.x963Representation)
        }
    }

    public func signature(for message: Data) throws -> Data {
        try key.withLock { state in
            guard let privateKey = state.active?.privateKey else {
                throw DeviceKeyStoreError.keyNotFound
            }
            return try privateKey.signature(for: message).derRepresentation
        }
    }

    public func deleteKey() throws {
        key.withLock {
            $0.active = nil
            $0.candidates.removeAll()
        }
    }
}

extension InMemoryKeyStore {
    fileprivate struct ActiveKey {
        let identifier: UUID?
        let privateKey: P256.Signing.PrivateKey
    }

    fileprivate struct State {
        var active: ActiveKey?
        var candidates: [UUID: P256.Signing.PrivateKey] = [:]
    }
}
