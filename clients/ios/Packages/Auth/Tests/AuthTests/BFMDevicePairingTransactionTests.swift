import AppCore
import AppCoreFakes
import AuthTestSupport
import BFMClient
import Foundation
import Testing

@testable import Auth

@Suite("BFMDevicePairingService transaction")
internal struct BFMDevicePairingTransactionTests {
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

    @Test("a refused replacement preserves the active key, tokens, identity and revision")
    func refusedReplacementPreservesPreviousIdentity() async throws {
        let keyStore = InMemoryKeyStore()
        let previousKey = try keyStore.createKey()
        let tokenStore = InMemoryTokenStore(
            initial: DeviceTokens(
                accessToken: "stale-access",
                refreshToken: "stale-refresh",
                accessTokenExpiresAt: Self.pairedAt
            )
        )
        let previousDevice = PairedDevice.fake(id: "previous-device")
        let deviceStore = InMemoryPairedDeviceStore(initial: previousDevice)
        let fixture = fixture(
            exchange: ScriptedPairingExchange(
                .failure(BFMClientError.pairingRefused(.codeRejected))),
            keyStore: keyStore,
            tokenStore: tokenStore,
            deviceStore: deviceStore
        )

        await #expect(throws: PairingError.codeRejected) { try await fixture.service.pair(.fake()) }

        #expect(try tokenStore.load()?.accessToken == "stale-access")
        #expect(try keyStore.publicKey() == previousKey)
        #expect(try deviceStore.load() == previousDevice)
        #expect(try deviceStore.loadSnapshot()?.revision == 0)
        #expect(keyStore.stagedCandidateCount == 0)
    }

    @Test("pairing does not wipe credentials before the code is accepted")
    func pairingDoesNotWipeBeforeExchange() async throws {
        let tokenStore = FailingTokenStore(
            wrapping: InMemoryTokenStore(),
            failing: [.wipe]
        )
        let fixture = fixture(tokenStore: tokenStore)

        _ = try await fixture.service.pair(.fake())

        #expect(fixture.exchange.calls.count == 1)
        #expect(try tokenStore.load()?.accessToken == "access-token")
    }

    @Test("a failed identity write restores the prior tokens and keeps the active key")
    func identityPersistenceFailureRestoresPreviousCredentials() async throws {
        let keyStore = InMemoryKeyStore()
        let previousKey = try keyStore.createKey()
        let previousTokens = DeviceTokens(
            accessToken: "previous-access",
            refreshToken: "previous-refresh",
            accessTokenExpiresAt: Self.pairedAt
        )
        let tokenStore = InMemoryTokenStore(initial: previousTokens)
        let previousDevice = PairedDevice.fake(id: "previous-device")
        let deviceStore = InMemoryPairedDeviceStore(initial: previousDevice)
        deviceStore.failWrites()
        let fixture = fixture(keyStore: keyStore, tokenStore: tokenStore, deviceStore: deviceStore)

        await #expect(throws: PairingError.credentialStorageFailed) {
            try await fixture.service.pair(.fake())
        }

        #expect(try tokenStore.load() == previousTokens)
        #expect(try keyStore.publicKey() == previousKey)
        #expect(try deviceStore.load() == previousDevice)
        #expect(try deviceStore.loadSnapshot()?.revision == 0)
    }

    @Test("a failed key activation restores the prior credential snapshot")
    func keyActivationFailureRestoresPreviousCredentials() async throws {
        let backingKeyStore = InMemoryKeyStore()
        let previousKey = try backingKeyStore.createKey()
        let keyStore = FailingKeyStore(wrapping: backingKeyStore, failing: [.activate])
        let previousTokens = DeviceTokens(
            accessToken: "previous-access",
            refreshToken: "previous-refresh",
            accessTokenExpiresAt: Self.pairedAt
        )
        let tokenStore = InMemoryTokenStore(initial: previousTokens)
        let previousDevice = PairedDevice.fake(id: "previous-device")
        let deviceStore = InMemoryPairedDeviceStore(initial: previousDevice)
        let fixture = fixture(keyStore: keyStore, tokenStore: tokenStore, deviceStore: deviceStore)

        await #expect(throws: PairingError.credentialStorageFailed) {
            try await fixture.service.pair(.fake())
        }

        #expect(try tokenStore.load() == previousTokens)
        #expect(try backingKeyStore.publicKey() == previousKey)
        #expect(backingKeyStore.stagedCandidateCount == 0)
        #expect(try deviceStore.load() == previousDevice)
        #expect(try deviceStore.loadSnapshot()?.revision == 0)
    }

    @Test("a wipe invalidates an exchange that finishes afterward")
    func wipePreventsInFlightPairingFromRestoringCredentials() async throws {
        let keyStore = InMemoryKeyStore()
        try keyStore.createKey()
        let tokenStore = InMemoryTokenStore(
            initial: DeviceTokens(
                accessToken: "previous-access",
                refreshToken: "previous-refresh",
                accessTokenExpiresAt: Self.pairedAt
            )
        )
        let deviceStore = InMemoryPairedDeviceStore(initial: .fake(id: "previous-device"))
        let credentialStore = DeviceCredentialStore(
            keyStore: keyStore,
            tokenStore: tokenStore,
            pairedDeviceStore: deviceStore
        )
        let exchange = GatedPairingExchange()
        let service = BFMDevicePairingService(credentialStore: credentialStore) { _ in exchange }
        let task = Task { try await service.pair(.fake()) }

        await exchange.waitUntilStarted()
        try credentialStore.wipe()
        await exchange.complete(.success(.stub(deviceId: "late-device")))

        await #expect(throws: PairingError.credentialStorageFailed) { try await task.value }
        #expect(try tokenStore.load() == nil)
        #expect(try keyStore.publicKey() == nil)
        #expect(keyStore.stagedCandidateCount == 0)
        #expect(try deviceStore.load() == nil)
        #expect(try deviceStore.loadSnapshot()?.revision == 1)
    }
}
