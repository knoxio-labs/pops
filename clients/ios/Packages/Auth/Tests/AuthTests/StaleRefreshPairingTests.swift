import AppCore
import AppCoreFakes
import AuthTestSupport
import BFMClient
import HTTPTypes
import OpenAPIRuntime
import Testing

@testable import Auth

@Suite("stale refresh after pairing")
internal struct StaleRefreshPairingTests {
    @Test("a refresh does not sign a newer identity with an older token")
    func staleRefreshDoesNotSignAfterPairing() async throws {
        let gate = Gate()
        let refreshExchange = ScriptedRefreshExchange(beforeChallenge: { await gate.wait() })
        let fixture = try RefresherFixture(exchange: refreshExchange)
        let refresh = Task { try await fixture.refreshedTokens(replacing: "access-1") }

        try await withDeadline { try await gate.waitForArrivals(atLeast: 1) }
        let pairing = BFMDevicePairingService(
            credentialStore: fixture.credentialStore,
            exchange: { _ in ScriptedPairingExchange() }
        )
        _ = try await pairing.pair(.fake())
        await gate.open()

        await #expect(throws: SessionRefreshError.unavailable("credentials changed during refresh"))
        {
            try await refresh.value
        }

        #expect(refreshExchange.challengeCount == 1)
        #expect(refreshExchange.spends.isEmpty)
        #expect(try fixture.tokenStore.load()?.accessToken == "access-token")
        #expect(fixture.session.events.isEmpty)
    }

    @Test("a late successful refresh cannot replace a newer pairing")
    func staleRefreshCannotOverwriteNewPairing() async throws {
        let gate = Gate()
        let refreshExchange = ScriptedRefreshExchange(beforeRefresh: { await gate.wait() })
        let fixture = try RefresherFixture(exchange: refreshExchange)
        let previousKey = try #require(try fixture.keyStore.publicKey())
        let refresh = Task { try await fixture.refreshedTokens(replacing: "access-1") }

        try await withDeadline { try await gate.waitForArrivals(atLeast: 1) }
        let pairing = BFMDevicePairingService(
            credentialStore: fixture.credentialStore,
            exchange: { _ in ScriptedPairingExchange() }
        )
        _ = try await pairing.pair(.fake())
        let pairedKey = try #require(try fixture.keyStore.publicKey())
        await gate.open()

        await #expect(throws: SessionRefreshError.unavailable("credentials changed during refresh"))
        {
            try await refresh.value
        }

        #expect(pairedKey != previousKey)
        #expect(try fixture.tokenStore.load()?.accessToken == "access-token")
        #expect(try fixture.keyStore.publicKey() == pairedKey)
        #expect(fixture.session.events.isEmpty)
    }

    @Test("a late refusal from the old identity cannot sign out a newer pairing")
    func staleRefusalCannotRejectNewPairing() async throws {
        let gate = Gate()
        let refreshExchange = ScriptedRefreshExchange(
            refreshes: [.failure(BFMClientError.refreshRefused(.invalidGrant))],
            beforeRefresh: { await gate.wait() }
        )
        let fixture = try RefresherFixture(exchange: refreshExchange)
        let refresh = Task { try await fixture.refreshedTokens(replacing: "access-1") }

        try await withDeadline { try await gate.waitForArrivals(atLeast: 1) }
        let pairing = BFMDevicePairingService(
            credentialStore: fixture.credentialStore,
            exchange: { _ in ScriptedPairingExchange() }
        )
        _ = try await pairing.pair(.fake())
        await gate.open()

        await #expect(throws: SessionRefreshError.unavailable("credentials changed during refresh"))
        {
            try await refresh.value
        }

        #expect(try fixture.tokenStore.load()?.accessToken == "access-token")
        #expect(try fixture.keyStore.publicKey() != nil)
        #expect(fixture.session.events.isEmpty)
    }

    @Test("a refusal already classified cannot revoke a pairing before it reaches the session")
    func classifiedRefusalCannotRevokeNewPairing() async throws {
        let gate = Gate()
        let refreshExchange = ScriptedRefreshExchange(
            refreshes: [.failure(BFMClientError.refreshRefused(.invalidGrant))]
        )
        let fixture = try RefresherFixture(exchange: refreshExchange)
        await fixture.refresher.observeRevocationPrechecks { await gate.wait() }
        let refresh = Task { try await fixture.refreshedTokens(replacing: "access-1") }

        try await withDeadline { try await gate.waitForArrivals(atLeast: 1) }
        let pairing = BFMDevicePairingService(
            credentialStore: fixture.credentialStore,
            exchange: { _ in ScriptedPairingExchange() }
        )
        let pairedDevice = try await pairing.pair(.fake())
        await gate.open()

        await #expect(throws: SessionRefreshError.credentialsRejected) {
            try await refresh.value
        }

        let revocation = try #require(fixture.session.events.first)
        #expect(
            revocation == .revoked(.credentialsRejected, ifCredentialRevision: 0)
        )
        #expect(
            SessionReducer.reduce(.paired(pairedDevice), applying: revocation)
                == .paired(pairedDevice)
        )
        #expect(try fixture.tokenStore.load()?.accessToken == "access-token")
        #expect(try fixture.pairedDeviceStore.load() == pairedDevice)
    }

    @Test("a stale revocation cannot wipe a pairing committed after its revision check")
    func staleRevocationCannotWipePairingAfterRevisionCheck() async throws {
        let gate = Gate()
        let refreshExchange = ScriptedRefreshExchange(
            refreshes: [.failure(BFMClientError.refreshRefused(.deviceRevoked))]
        )
        let fixture = try RefresherFixture(exchange: refreshExchange)
        await fixture.refresher.observeRevocationPrechecks { await gate.wait() }
        let refresh = Task { try await fixture.refreshedTokens(replacing: "access-1") }

        try await withDeadline { try await gate.waitForArrivals(atLeast: 1) }
        let pairing = BFMDevicePairingService(
            credentialStore: fixture.credentialStore,
            exchange: { _ in ScriptedPairingExchange() }
        )
        let pairedDevice = try await pairing.pair(.fake())
        let pairedKey = try #require(try fixture.keyStore.publicKey())
        await gate.open()

        await #expect(throws: SessionRefreshError.unavailable("credentials changed during refresh"))
        {
            try await refresh.value
        }

        #expect(try fixture.tokenStore.load()?.accessToken == "access-token")
        #expect(try fixture.keyStore.publicKey() == pairedKey)
        #expect(try fixture.pairedDeviceStore.load() == pairedDevice)
        #expect(try fixture.pairedDeviceStore.loadSnapshot()?.revision == 1)
        #expect(fixture.session.events.isEmpty)
    }

    @Test("an authenticated refusal cannot revoke a pairing committed while its body is read")
    func staleAuthenticatedRevocationCannotWipeNewPairing() async throws {
        let gate = Gate()
        let fixture = try MiddlewareFixture()
        let payload = Array(#"{"code":"bfm.auth.device_revoked"}"#.utf8)
        let body = AsyncThrowingStream<ArraySlice<UInt8>, any Error> { continuation in
            Task {
                await gate.wait()
                continuation.yield(ArraySlice(payload))
                continuation.finish()
            }
        }
        let transport = RecordingTransport(
            respond: { _ in .forbidden },
            responseBody: { _ in HTTPBody(body, length: .unknown, iterationBehavior: .single) }
        )
        let request = Task { try await fixture.sendResponse(through: transport) }

        try await withDeadline { try await transport.waitForAttempts(atLeast: 1) }
        try await withDeadline { try await gate.waitForArrivals(atLeast: 1) }
        #expect(transport.attempts.first?.authorization == "Bearer access-1")
        let pairing = BFMDevicePairingService(
            credentialStore: fixture.refresher.credentialStore,
            exchange: { _ in ScriptedPairingExchange() }
        )
        let pairedDevice = try await pairing.pair(.fake())
        let pairedKey = try #require(try fixture.keyStore.publicKey())
        await gate.open()
        let (response, responseBody) = try await request.value

        #expect(response.status == .forbidden)
        #expect(try await [UInt8](collecting: #require(responseBody), upTo: 1_024) == payload)
        #expect(try fixture.tokenStore.load()?.accessToken == "access-token")
        #expect(try fixture.keyStore.publicKey() == pairedKey)
        #expect(try fixture.pairedDeviceStore.load() == pairedDevice)
        #expect(try fixture.pairedDeviceStore.loadSnapshot()?.revision == 1)
        #expect(fixture.session.events.isEmpty)
    }
}
