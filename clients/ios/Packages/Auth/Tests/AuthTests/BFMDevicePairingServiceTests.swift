import AppCore
import AppCoreFakes
import AuthTestSupport
import BFMClient
import Foundation
import Testing

@testable import Auth

/// What the service leaves behind for each exchange and activation outcome.
@Suite("BFMDevicePairingService")
internal struct BFMDevicePairingServiceTests {
    private static let pairedAt = Date(timeIntervalSince1970: 1_700_000_000)

    private struct Fixture {
        let service: BFMDevicePairingService
        let credentialStore: DeviceCredentialStore
        let keyStore: any DeviceKeyStore
        let tokenStore: any TokenStore
        let deviceStore: InMemoryPairedDeviceStore
        let exchange: ScriptedPairingExchange
    }

    private func fixture(
        exchange: ScriptedPairingExchange = ScriptedPairingExchange(),
        keyStore: any DeviceKeyStore = InMemoryKeyStore(),
        tokenStore: any TokenStore = InMemoryTokenStore(),
        deviceStore: InMemoryPairedDeviceStore = InMemoryPairedDeviceStore()
    ) -> Fixture {
        let credentialStore = DeviceCredentialStore(
            keyStore: keyStore,
            tokenStore: tokenStore,
            pairedDeviceStore: deviceStore
        )
        return Fixture(
            service: BFMDevicePairingService(
                credentialStore: credentialStore,
                exchange: { _ in exchange },
                now: { Self.pairedAt }
            ),
            credentialStore: credentialStore,
            keyStore: keyStore,
            tokenStore: tokenStore,
            deviceStore: deviceStore,
            exchange: exchange
        )
    }

    @Test("a successful exchange returns the device and persists the token pair")
    func happyPath() async throws {
        let fixture = fixture()

        let device = try await fixture.service.pair(.fake(baseURL: .fakeBFM, code: "7QK4"))

        #expect(device.id == "6ba7b810-9dad-41d1-80b4-00c04fd430c8")
        // The base URL is the one that arrived with the code, not anything the
        // server said — the server has no idea how the phone reached it.
        #expect(device.baseURL == .fakeBFM)

        let stored = try #require(try fixture.tokenStore.load())
        #expect(stored.accessToken == "access-token")
        #expect(stored.refreshToken == "refresh-token")
        // `expiresIn` is a duration; the deadline is this device's clock plus
        // it. Asserted against the injected clock so the arithmetic is checked
        // rather than the wall clock.
        #expect(stored.accessTokenExpiresAt == Self.pairedAt.addingTimeInterval(900))

        #expect(try fixture.keyStore.publicKey() != nil)
    }

    @Test("the exchange is sent the key that was just created, in the wire encoding")
    func sendsTheGeneratedKey() async throws {
        let fixture = fixture()

        _ = try await fixture.service.pair(
            .fake(code: "7QK4-9M2X-P3ND", deviceName: "Joao's iPhone", deviceModel: "iPhone17,1"))

        let call = try #require(fixture.exchange.calls.first)
        #expect(call.code == "7QK4-9M2X-P3ND")
        #expect(call.deviceName == "Joao's iPhone")
        #expect(call.deviceModel == "iPhone17,1")

        // Not merely non-empty: the exact base64 of the key the store holds. A
        // service that sent a stale or re-derived key would pair a public half
        // this device cannot sign for, and the symptom would be a 401 on the
        // first refresh rather than anything visible at pairing.
        let key = try #require(try fixture.keyStore.publicKey())
        #expect(call.publicKeyBase64DER == key.base64EncodedDER)
    }

    /// A refusal discards the staged key without disturbing the active one.
    @Test(
        "a refused exchange discards its candidate and preserves the active key",
        arguments: [
            BFMClientError.pairingRefused(.codeRejected),
            BFMClientError.pairingRefused(.invalidRequest),
            BFMClientError.pairingRefused(.rateLimited(retryAfterSeconds: 30)),
            BFMClientError.undocumentedResponse(operation: "device.pair", statusCode: 502),
        ])
    func failedExchangeCleansUpTheKey(refusal: BFMClientError) async throws {
        let keyStore = InMemoryKeyStore()
        let active = try keyStore.createKey()
        let fixture = fixture(
            exchange: ScriptedPairingExchange(.failure(refusal)),
            keyStore: keyStore
        )

        await #expect(throws: (any Error).self) { try await fixture.service.pair(.fake()) }

        #expect(try fixture.keyStore.publicKey() == active)
        #expect(try fixture.tokenStore.load() == nil)
        #expect(keyStore.stagedCandidateCount == 0)
    }

    /// A new attempt has to generate and send a distinct key after the previous
    /// candidate was discarded.
    @Test("a retry after a refusal reaches the server with a fresh candidate")
    func retryAfterRefusalReachesTheServer() async throws {
        let exchange = ScriptedPairingExchange(
            .failure(BFMClientError.pairingRefused(.codeRejected)))
        let keyStore = InMemoryKeyStore()
        let fixture = fixture(exchange: exchange, keyStore: keyStore)

        await #expect(throws: PairingError.codeRejected) { try await fixture.service.pair(.fake()) }
        await #expect(throws: PairingError.codeRejected) { try await fixture.service.pair(.fake()) }

        #expect(exchange.calls.count == 2)
        // Two attempts, two distinct keys — the second was created rather than
        // the first being reused.
        #expect(exchange.calls[0].publicKeyBase64DER != exchange.calls[1].publicKeyBase64DER)
        #expect(keyStore.stagedCandidateCount == 0)
    }

    @Test(
        "each documented refusal reaches the caller as its own PairingError",
        arguments: [
            (BFMClientError.pairingRefused(.codeRejected), PairingError.codeRejected),
            (BFMClientError.pairingRefused(.invalidRequest), PairingError.invalidRequest),
            (
                BFMClientError.pairingRefused(.rateLimited(retryAfterSeconds: 30)),
                PairingError.rateLimited(retryAfterSeconds: 30)
            ),
            // A rate limit whose wait the BFM did not state — an HTML page from
            // an intermediary. Must not collapse into `unreachable`, which is
            // the opposite advice.
            (
                BFMClientError.pairingRefused(.rateLimited(retryAfterSeconds: nil)),
                PairingError.rateLimited(retryAfterSeconds: nil)
            ),
            (
                BFMClientError.undocumentedResponse(operation: "device.pair", statusCode: 502),
                PairingError.unreachable
            ),
        ])
    func refusalIsMapped(thrown: BFMClientError, expected: PairingError) async throws {
        let fixture = fixture(exchange: ScriptedPairingExchange(.failure(thrown)))

        await #expect(throws: expected) { try await fixture.service.pair(.fake()) }
    }

    /// Everything that is not a `BFMClientError` — a dead network arrives as an
    /// `OpenAPIRuntime.ClientError`, which this package cannot name and must not
    /// have to.
    @Test("an unrecognised transport failure reads as unreachable")
    func transportFailureIsUnreachable() async throws {
        struct Offline: Error {}
        let fixture = fixture(exchange: ScriptedPairingExchange(.failure(Offline())))

        await #expect(throws: PairingError.unreachable) { try await fixture.service.pair(.fake()) }
    }

    @Test("a key that cannot be created fails before the code is spent")
    func keyGenerationFailureDoesNotSpendTheCode() async throws {
        let exchange = ScriptedPairingExchange()
        let fixture = fixture(
            exchange: exchange,
            keyStore: FailingKeyStore(wrapping: InMemoryKeyStore(), failing: [.create])
        )

        await #expect(throws: PairingError.keyGenerationFailed) {
            try await fixture.service.pair(.fake())
        }

        // A code is single-use. Spending one to discover the Enclave is
        // unavailable would cost the operator a fresh code for nothing.
        #expect(exchange.calls.isEmpty)
    }

    /// The failure that leaves a device registered on a server it cannot talk
    /// to. It gets its own error because it is the only one whose recovery is
    /// "the operator has to revoke something".
    @Test("credentials that cannot be stored surface as their own failure, and drop the key")
    func tokenPersistenceFailureIsDistinct() async throws {
        let keyStore = InMemoryKeyStore()
        let fixture = fixture(
            keyStore: keyStore,
            tokenStore: FailingTokenStore(wrapping: InMemoryTokenStore(), failing: [.save])
        )

        await #expect(throws: PairingError.credentialStorageFailed) {
            try await fixture.service.pair(.fake())
        }

        #expect(try keyStore.publicKey() == nil)
    }

    /// A key from an earlier app version may remain at the legacy active tag;
    /// activating a successful candidate replaces it without a preliminary wipe.
    @Test("a legacy active key does not block a fresh pairing")
    func strandedKeyIsReplaced() async throws {
        let keyStore = InMemoryKeyStore()
        let stranded = try keyStore.createKey()
        let fixture = fixture(keyStore: keyStore)

        _ = try await fixture.service.pair(.fake())

        let current = try #require(try keyStore.publicKey())
        #expect(current != stranded)
        #expect(
            try #require(fixture.exchange.calls.first).publicKeyBase64DER
                == current.base64EncodedDER)
    }
}
