import CryptoKit
import Foundation
import Testing

@testable import Auth
@testable import AuthTestSupport

/// The full key lifecycle against the fake. The real Secure Enclave path
/// implements the same protocol and is covered, on the simulator and on
/// hardware, by `SecureEnclaveKeyStoreTests` in the app's hosted test target
/// (`clients/ios/AppTests`) — this package's own tests cannot create that key,
/// see `SecureEnclaveKeyStore`'s doc comment for why.
@Suite("device key lifecycle")
internal struct DeviceKeyStoreTests {
    @Test("a created key is retrievable and stable")
    func createThenRead() throws {
        let store = InMemoryKeyStore()

        let created = try store.createKey()
        let read = try store.publicKey()

        #expect(read == created)
        #expect(try store.publicKey() == created)
    }

    @Test("an unpaired store has no key")
    func noKeyBeforeCreate() throws {
        #expect(try InMemoryKeyStore().publicKey() == nil)
    }

    /// Silently replacing would leave the BFM holding a public key whose
    /// private half no longer exists, and every later refresh would fail with
    /// no way to tell why.
    @Test("creating a second key is refused rather than replacing the first")
    func createIsNotIdempotent() throws {
        let store = InMemoryKeyStore()
        let first = try store.createKey()

        #expect(throws: DeviceKeyStoreError.keyAlreadyExists) {
            try store.createKey()
        }
        #expect(try store.publicKey() == first)
    }

    @Test("re-pairing works by deleting first")
    func deleteThenCreateReplacesTheIdentity() throws {
        let store = InMemoryKeyStore()
        let first = try store.createKey()

        try store.deleteKey()
        let second = try store.createKey()

        #expect(second != first)
    }

    @Test("a signature verifies against the key that produced it")
    func signAndVerify() throws {
        let store = InMemoryKeyStore()
        let publicKey = try store.createKey()
        let message = Data("nonce=abc;refresh=def".utf8)

        let signature = try store.signature(for: message)

        #expect(publicKey.isValidSignature(signature, for: message))
    }

    /// Guards against a verifier that returns `true` unconditionally — which
    /// would make every other signing assertion in this file vacuous.
    @Test("a signature does not verify against a different device's key")
    func signaturesAreKeyBound() throws {
        let device = InMemoryKeyStore()
        let other = InMemoryKeyStore()
        try device.createKey()
        let otherKey = try other.createKey()
        let message = Data("nonce=abc;refresh=def".utf8)

        let signature = try device.signature(for: message)

        #expect(!otherKey.isValidSignature(signature, for: message))
    }

    @Test("signing the empty message is still a valid signature")
    func emptyMessageSigns() throws {
        let store = InMemoryKeyStore()
        let publicKey = try store.createKey()

        let signature = try store.signature(for: Data())

        #expect(publicKey.isValidSignature(signature, for: Data()))
    }

    @Test("signing without a key fails rather than inventing one")
    func signBeforeCreate() {
        #expect(throws: DeviceKeyStoreError.keyNotFound) {
            try InMemoryKeyStore().signature(for: Data("anything".utf8))
        }
    }

    @Test("deletion removes the key and everything that depends on it")
    func deleteRemovesTheKey() throws {
        let store = InMemoryKeyStore()
        try store.createKey()

        try store.deleteKey()

        #expect(try store.publicKey() == nil)
        #expect(throws: DeviceKeyStoreError.keyNotFound) {
            try store.signature(for: Data("after deletion".utf8))
        }
    }

    /// Revocation recovery calls this on a device that may already be clean; a
    /// throw there would strand the app holding credentials it knows are dead.
    @Test("deleting an absent key succeeds")
    func deleteIsIdempotent() throws {
        let store = InMemoryKeyStore()

        try store.deleteKey()
        try store.deleteKey()

        #expect(try store.publicKey() == nil)
    }

    @Test("a malformed point is rejected before it can be sent as a public key")
    func malformedPublicKeysAreRejected() {
        let cases: [Data] = [
            Data(),
            Data([0x04]),
            Data(repeating: 0x04, count: 65),
            Data(repeating: 0x00, count: 65),
        ]

        for bytes in cases {
            #expect(throws: DeviceKeyStoreError.malformedPublicKey) {
                try DevicePublicKey(x963Representation: bytes)
            }
        }
    }

    @Test("a garbage signature does not verify")
    func garbageSignatureIsRejected() throws {
        let store = InMemoryKeyStore()
        let publicKey = try store.createKey()
        let message = Data("real message".utf8)

        #expect(!publicKey.isValidSignature(Data(repeating: 0xAB, count: 70), for: message))
        #expect(!publicKey.isValidSignature(Data(), for: message))
    }
}
