import AppCore
import AppCoreFakes
import AuthTestSupport
import BFMClient
import Foundation
import Testing

@testable import Auth

/// What the service leaves behind, for every way the exchange can end.
///
/// The assertions are about state rather than about calls: after each failure
/// the device must hold no key and no tokens, because a key the BFM has never
/// seen is the thing that makes the *next* attempt fail as a key-generation
/// error, and a token pair with no key behind it is a credential that can never
/// be refreshed.
@Suite("BFMDevicePairingService")
internal struct BFMDevicePairingServiceTests {
    private static let pairedAt = Date(timeIntervalSince1970: 1_700_000_000)

    private struct Fixture {
        let service: BFMDevicePairingService
        let keyStore: any DeviceKeyStore
        let tokenStore: any TokenStore
        let exchange: ScriptedPairingExchange
    }

    private func fixture(
        exchange: ScriptedPairingExchange = ScriptedPairingExchange(),
        keyStore: any DeviceKeyStore = InMemoryKeyStore(),
        tokenStore: any TokenStore = InMemoryTokenStore()
    ) -> Fixture {
        Fixture(
            service: BFMDevicePairingService(
                credentialStore: DeviceCredentialStore(keyStore: keyStore, tokenStore: tokenStore),
                exchange: { _ in exchange },
                now: { Self.pairedAt }
            ),
            keyStore: keyStore,
            tokenStore: tokenStore,
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

    /// The acceptance criterion this whole type exists for: however the
    /// exchange ended, the device holds nothing afterwards.
    @Test(
        "a refused exchange deletes the key it created",
        arguments: [
            BFMClientError.pairingRefused(.codeRejected),
            BFMClientError.pairingRefused(.invalidRequest),
            BFMClientError.pairingRefused(.rateLimited(retryAfterSeconds: 30)),
            BFMClientError.undocumentedResponse(operation: "device.pair", statusCode: 502),
        ])
    func failedExchangeCleansUpTheKey(refusal: BFMClientError) async throws {
        let fixture = fixture(exchange: ScriptedPairingExchange(.failure(refusal)))

        await #expect(throws: (any Error).self) { try await fixture.service.pair(.fake()) }

        #expect(try fixture.keyStore.publicKey() == nil)
        #expect(try fixture.tokenStore.load() == nil)
    }

    /// The consequence of the cleanup above, which is what actually matters and
    /// is not visible from the store's state alone.
    ///
    /// `InMemoryKeyStore` throws `keyAlreadyExists` on a second `createKey`,
    /// exactly as the Enclave does. So a service that leaked the key would fail
    /// this retry with `keyGenerationFailed` and never reach the server — the
    /// permanent trap a real device would fall into. Asserting the *specific*
    /// error is the whole test: "it throws something" passes either way.
    @Test("a retry after a refusal reaches the server rather than the stranded key")
    func retryAfterRefusalReachesTheServer() async throws {
        let exchange = ScriptedPairingExchange(
            .failure(BFMClientError.pairingRefused(.codeRejected)))
        let fixture = fixture(exchange: exchange)

        await #expect(throws: PairingError.codeRejected) { try await fixture.service.pair(.fake()) }
        await #expect(throws: PairingError.codeRejected) { try await fixture.service.pair(.fake()) }

        #expect(exchange.calls.count == 2)
        // Two attempts, two distinct keys — the second was created rather than
        // the first being reused.
        #expect(exchange.calls[0].publicKeyBase64DER != exchange.calls[1].publicKeyBase64DER)
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

    /// A key stranded by an attempt that died between creating it and cleaning
    /// it up — a crash, a cancelled task. Without the up-front wipe this is
    /// unrecoverable from inside the app: every later attempt throws
    /// `keyAlreadyExists`, which the service reports as `keyGenerationFailed`,
    /// forever.
    @Test("a key stranded by an earlier attempt does not block a fresh pairing")
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

    /// Tokens from a dead identity outliving the pairing that replaced them is
    /// the one thing worse than failing: the transport would attach a token
    /// belonging to a device the server no longer knows.
    @Test("tokens left by an earlier identity are gone before the exchange runs")
    func previousTokensAreWiped() async throws {
        let tokenStore = InMemoryTokenStore(
            initial: DeviceTokens(
                accessToken: "stale-access",
                refreshToken: "stale-refresh",
                accessTokenExpiresAt: Self.pairedAt
            )
        )
        let fixture = fixture(
            exchange: ScriptedPairingExchange(
                .failure(BFMClientError.pairingRefused(.codeRejected))),
            tokenStore: tokenStore
        )

        await #expect(throws: PairingError.codeRejected) { try await fixture.service.pair(.fake()) }

        #expect(try tokenStore.load() == nil)
    }

    /// A wipe that cannot complete means the old refresh token may still be on
    /// the device. Pairing on top of that would leave two live credentials, so
    /// it stops instead.
    @Test("a wipe that fails stops the attempt rather than pairing over it")
    func failedWipeAbortsPairing() async throws {
        let exchange = ScriptedPairingExchange()
        let fixture = fixture(
            exchange: exchange,
            tokenStore: FailingTokenStore(wrapping: InMemoryTokenStore(), failing: [.wipe])
        )

        await #expect(throws: PairingError.credentialStorageFailed) {
            try await fixture.service.pair(.fake())
        }

        #expect(exchange.calls.isEmpty)
    }
}
