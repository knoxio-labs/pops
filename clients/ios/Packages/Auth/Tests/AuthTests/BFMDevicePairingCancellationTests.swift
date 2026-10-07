import AppCore
import AppCoreFakes
import AuthTestSupport
import Foundation
import Testing

@testable import Auth

@Suite("BFMDevicePairingService cancellation")
internal struct BFMDevicePairingCancellationTests {
    private static let pairedAt = Date(timeIntervalSince1970: 1_700_000_000)

    @Test("cancellation after a successful response still activates the accepted identity")
    func cancellationAfterAcceptanceCommitsCredentials() async throws {
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
        let credentialStore = DeviceCredentialStore(
            keyStore: keyStore,
            tokenStore: tokenStore,
            pairedDeviceStore: deviceStore
        )
        let exchange = GatedPairingExchange()
        let service = BFMDevicePairingService(credentialStore: credentialStore) { _ in exchange }
        let task = Task { try await service.pair(.fake()) }

        await exchange.waitUntilStarted()
        let issuedRequest = try #require(await exchange.call)
        task.cancel()
        await exchange.complete(.success(.stub(deviceId: "cancelled-device")))

        let device = try await task.value
        #expect(device.id == "cancelled-device")
        #expect(try tokenStore.load()?.accessToken == "access-token")
        #expect(try keyStore.publicKey()?.base64EncodedDER == issuedRequest.publicKeyBase64DER)
        #expect(keyStore.stagedCandidateCount == 0)
        #expect(try deviceStore.load() == device)
        #expect(try deviceStore.loadSnapshot()?.revision == 1)
        #expect(try keyStore.publicKey() != previousKey)
    }

    @Test("cancellation before an accepted response discards only the candidate")
    func cancellationBeforeAcceptancePreservesPreviousIdentity() async throws {
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
        let credentialStore = DeviceCredentialStore(
            keyStore: keyStore,
            tokenStore: tokenStore,
            pairedDeviceStore: deviceStore
        )
        let exchange = GatedPairingExchange()
        let service = BFMDevicePairingService(credentialStore: credentialStore) { _ in exchange }
        let task = Task { try await service.pair(.fake()) }

        await exchange.waitUntilStarted()
        task.cancel()
        await exchange.complete(.failure(CancellationError()))

        await #expect(throws: CancellationError.self) { try await task.value }
        #expect(try tokenStore.load() == previousTokens)
        #expect(try keyStore.publicKey() == previousKey)
        #expect(keyStore.stagedCandidateCount == 0)
        #expect(try deviceStore.load() == previousDevice)
        #expect(try deviceStore.loadSnapshot()?.revision == 0)
    }
}
