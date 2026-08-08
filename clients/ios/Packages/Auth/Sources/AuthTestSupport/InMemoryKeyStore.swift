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
    private let key = Mutex<P256.Signing.PrivateKey?>(nil)

    public init() {}

    @discardableResult
    public func createKey() throws -> DevicePublicKey {
        try key.withLock { stored in
            guard stored == nil else { throw DeviceKeyStoreError.keyAlreadyExists }
            let generated = P256.Signing.PrivateKey()
            stored = generated
            return try DevicePublicKey(x963Representation: generated.publicKey.x963Representation)
        }
    }

    public func publicKey() throws -> DevicePublicKey? {
        try key.withLock { stored in
            guard let stored else { return nil }
            return try DevicePublicKey(x963Representation: stored.publicKey.x963Representation)
        }
    }

    public func signature(for message: Data) throws -> Data {
        try key.withLock { stored in
            guard let stored else { throw DeviceKeyStoreError.keyNotFound }
            return try stored.signature(for: message).derRepresentation
        }
    }

    public func deleteKey() throws {
        key.withLock { $0 = nil }
    }
}
