import Foundation
import Testing

@testable import Auth
@testable import AuthTestSupport

/// Doubles that fail one operation while leaving the rest working, so a wipe
/// can be driven into partial failure. They live here rather than in
/// `AuthTestSupport` because a store that is designed to fail has no business
/// being reachable from anything but this file.
private struct FailingDeleteKeyStore: DeviceKeyStore {
    let wrapped: InMemoryKeyStore

    @discardableResult
    func createKey() throws -> DevicePublicKey { try wrapped.createKey() }
    func publicKey() throws -> DevicePublicKey? { try wrapped.publicKey() }
    func signature(for message: Data) throws -> Data { try wrapped.signature(for: message) }
    func deleteKey() throws { throw DeviceKeyStoreError.keychain(-25300) }
}

private struct FailingWipeTokenStore: TokenStore {
    let wrapped: InMemoryTokenStore

    func load() throws -> DeviceTokens? { try wrapped.load() }
    func save(_ tokens: DeviceTokens) throws { try wrapped.save(tokens) }
    func wipe() throws { throw TokenStoreError.keychain(-25300) }
}

@Suite("credential wipe on revocation")
internal struct DeviceCredentialStoreTests {
    static func tokens() -> DeviceTokens {
        DeviceTokens(
            accessToken: "access",
            refreshToken: "refresh",
            accessTokenExpiresAt: Date(timeIntervalSince1970: 1_786_000_000)
        )
    }

    /// A paired device, with the two fakes kept to hand so a test can assert on
    /// what is left behind rather than only on what `wipe()` returned.
    struct PairedFixture {
        let store: DeviceCredentialStore
        let keyStore: InMemoryKeyStore
        let tokenStore: InMemoryTokenStore
        let deviceStore: InMemoryPairedDeviceStore
    }

    static func pairedStore() throws -> PairedFixture {
        let keyStore = InMemoryKeyStore()
        let tokenStore = InMemoryTokenStore(initial: tokens())
        let deviceStore = InMemoryPairedDeviceStore(initial: .fake())
        try keyStore.createKey()
        return PairedFixture(
            store: DeviceCredentialStore(
                keyStore: keyStore,
                tokenStore: tokenStore,
                pairedDeviceStore: deviceStore
            ),
            keyStore: keyStore,
            tokenStore: tokenStore,
            deviceStore: deviceStore
        )
    }

    @Test("a wipe removes the key and the tokens")
    func wipeRemovesEverything() throws {
        let paired = try Self.pairedStore()

        try paired.store.wipe()

        #expect(try paired.keyStore.publicKey() == nil)
        #expect(try paired.tokenStore.load() == nil)
    }

    @Test("wiping an already-clean device succeeds")
    func wipeIsIdempotent() throws {
        let store = DeviceCredentialStore(
            keyStore: InMemoryKeyStore(),
            tokenStore: InMemoryTokenStore(),
            pairedDeviceStore: InMemoryPairedDeviceStore()
        )

        try store.wipe()
        try store.wipe()
    }

    /// The failure mode the whole design is arranged around. If key deletion
    /// throwing stopped the wipe, a revoked device would keep a live refresh
    /// token — and the throw would look like the wipe simply had not happened.
    @Test("a key-deletion failure still leaves the tokens gone")
    func keyFailureDoesNotStrandTokens() throws {
        let tokenStore = InMemoryTokenStore(initial: Self.tokens())
        let keyStore = FailingDeleteKeyStore(wrapped: InMemoryKeyStore())
        try keyStore.createKey()
        let store = DeviceCredentialStore(
            keyStore: keyStore,
            tokenStore: tokenStore,
            pairedDeviceStore: InMemoryPairedDeviceStore()
        )

        #expect(throws: DeviceCredentialWipeError.self) {
            try store.wipe()
        }
        #expect(try tokenStore.load() == nil)
    }

    /// The mirror case, and the one where the caller must retry: the key is
    /// gone but a bearer token may still be on the device.
    @Test("a token-wipe failure is reported as tokens possibly remaining")
    func tokenFailureIsReportedDistinctly() throws {
        let inner = InMemoryTokenStore(initial: Self.tokens())
        let keyStore = InMemoryKeyStore()
        try keyStore.createKey()
        let store = DeviceCredentialStore(
            keyStore: keyStore,
            tokenStore: FailingWipeTokenStore(wrapped: inner),
            pairedDeviceStore: InMemoryPairedDeviceStore()
        )

        let error = #expect(throws: DeviceCredentialWipeError.self) {
            try store.wipe()
        }

        #expect(error?.tokensMayRemain == true)
        #expect(error?.keyStoreFailure == nil)
        #expect(try keyStore.publicKey() == nil)
    }

    /// Reporting only the first failure would hide the second behind it, and
    /// the second is the one that decides whether the app must retry.
    @Test("both failures are reported together")
    func bothFailuresSurface() throws {
        let keyStore = FailingDeleteKeyStore(wrapped: InMemoryKeyStore())
        try keyStore.createKey()
        let store = DeviceCredentialStore(
            keyStore: keyStore,
            tokenStore: FailingWipeTokenStore(wrapped: InMemoryTokenStore(initial: Self.tokens())),
            pairedDeviceStore: InMemoryPairedDeviceStore()
        )

        let error = #expect(throws: DeviceCredentialWipeError.self) {
            try store.wipe()
        }

        #expect(error?.tokenStoreFailure != nil)
        #expect(error?.keyStoreFailure != nil)
        #expect(error?.tokensMayRemain == true)
    }

    @Test("a successful wipe reports nothing remaining")
    func successReportsNoFailure() throws {
        let paired = try Self.pairedStore()

        #expect(throws: Never.self) {
            try paired.store.wipe()
        }
    }

    @Test("the wipe error describes every part without exposing credentials")
    func wipeErrorIsDescriptiveAndSafe() {
        let error = DeviceCredentialWipeError(
            tokenStoreFailure: TokenStoreError.keychain(-25300),
            keyStoreFailure: DeviceKeyStoreError.keyNotFound,
            pairedDeviceStoreFailure: PairedDeviceStoreError.corruptedPayload
        )

        #expect(error.description.contains("tokens:"))
        #expect(error.description.contains("key:"))
        #expect(error.description.contains("paired device:"))
    }

    /// The identity is not a credential, but a device that keeps it after a
    /// revocation restores a session on the next launch and then fails every
    /// request in it — a worse screen than the pairing one.
    @Test("a wipe removes the device's identity along with its credentials")
    func wipeRemovesTheIdentity() throws {
        let paired = try Self.pairedStore()

        try paired.store.wipe()

        #expect(try paired.deviceStore.load() == nil)
    }
}
