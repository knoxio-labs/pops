import AppCore
import AppCoreFakes
import BFMClient
import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing

@testable import Auth

@Suite("Paired-client credential ownership")
internal struct BoundAuthenticatingMiddlewareTests {
    @Test("an old client cannot send a replacement pairing token, even at the same origin")
    internal func replacementBeforeSend() async throws {
        let fixture = try RefresherFixture()
        let owner = try #require(try fixture.pairedDeviceStore.load())
        let middleware = AuthenticatingMiddleware(
            refresher: fixture.refresher, expectedDevice: owner)
        let replacement = try await replace(fixture)
        let transport = RecordingTransport { _ in .ok }
        await #expect(throws: SessionRefreshError.unavailable("paired client identity changed")) {
            try await send(middleware, through: transport)
        }
        #expect(transport.attempts.isEmpty)
        #expect(fixture.exchange.challengeCount == 0)
        #expect(try fixture.pairedDeviceStore.load() == replacement)
        #expect(fixture.session.events.isEmpty)
    }

    @Test("a bound client refuses a different base URL before any authenticated send")
    internal func wrongBaseURL() async throws {
        let fixture = try RefresherFixture()
        let middleware = AuthenticatingMiddleware(
            refresher: fixture.refresher,
            expectedDevice: try #require(try fixture.pairedDeviceStore.load()))
        let transport = RecordingTransport { _ in .ok }
        await #expect(throws: SessionRefreshError.unavailable("paired client identity changed")) {
            try await send(
                middleware, through: transport,
                baseURL: #require(URL(string: "https://other-bfm.example")))
        }
        #expect(transport.attempts.isEmpty)
        #expect(fixture.exchange.challengeCount == 0)
        #expect(fixture.session.events.isEmpty)
    }

    @Test(
        "same-owner token rotation preserves the pairing revision and authenticates exactly one retry"
    )
    internal func legitimateRotation() async throws {
        let fixture = try RefresherFixture()
        let owner = try #require(try fixture.pairedDeviceStore.load())
        let middleware = AuthenticatingMiddleware(
            refresher: fixture.refresher, expectedDevice: owner)
        let transport = RecordingTransport.rejecting("access-1")
        #expect(try await send(middleware, through: transport).0.status == .ok)
        #expect(transport.attempts.count == 2)
        #expect(transport.attempts.first?.authorization == "Bearer access-1")
        #expect(transport.attempts.last?.authorization == "Bearer access-2")
        #expect(
            try fixture.pairedDeviceStore.load()?.credentialRevision == owner.credentialRevision)
        #expect(fixture.exchange.challengeCount == 1)
    }

    @Test(
        "replacement after first send cannot spend the new pairing grant or retry it at the old origin"
    )
    internal func replacementAfter401() async throws {
        let gate = Gate()
        let fixture = try RefresherFixture()
        let middleware = AuthenticatingMiddleware(
            refresher: fixture.refresher,
            expectedDevice: try #require(try fixture.pairedDeviceStore.load()))
        let transport = RecordingTransport.rejecting("access-1", onArrival: { await gate.wait() })
        let request = Task { try await send(middleware, through: transport) }
        try await withDeadline { try await gate.waitForArrivals(atLeast: 1) }
        let replacement = try await replace(
            fixture, baseURL: #require(URL(string: "https://new-bfm.example")))
        await gate.open()
        await #expect(throws: SessionRefreshError.unavailable("paired client identity changed")) {
            try await request.value
        }
        #expect(transport.attempts.count == 1)
        #expect(fixture.exchange.challengeCount == 0)
        #expect(try fixture.pairedDeviceStore.load() == replacement)
        #expect(fixture.session.events.isEmpty)
    }

    @Test("replacement during refresh cannot overwrite or retry with the replacement credentials")
    internal func replacementDuringRefresh() async throws {
        let gate = Gate()
        let exchange = ScriptedRefreshExchange(beforeRefresh: { await gate.wait() })
        let fixture = try RefresherFixture(exchange: exchange)
        let middleware = AuthenticatingMiddleware(
            refresher: fixture.refresher,
            expectedDevice: try #require(try fixture.pairedDeviceStore.load()))
        let transport = RecordingTransport.rejecting("access-1")
        let request = Task { try await send(middleware, through: transport) }
        try await withDeadline { try await gate.waitForArrivals(atLeast: 1) }
        let replacement = try await replace(fixture)
        await gate.open()
        await #expect(throws: SessionRefreshError.unavailable("credentials changed during refresh"))
        { try await request.value }
        #expect(transport.attempts.count == 1)
        #expect(try fixture.pairedDeviceStore.load() == replacement)
        #expect(try fixture.tokenStore.load()?.accessToken == "access-token")
        #expect(fixture.session.events.isEmpty)
    }

    @Test(
        "a joined rotation result from a different pairing revision is never returned to the bound caller"
    )
    internal func wrongJoinedRotation() async throws {
        let fixture = try RefresherFixture()
        let owner = try #require(try fixture.pairedDeviceStore.load())
        let gate = Gate()
        await fixture.refresher.installJoinedRotationForTest(
            Task {
                await gate.wait()
                return CredentialTokenSnapshot(
                    revision: owner.credentialRevision + 1,
                    tokens: .stub(accessToken: "different-owner"))
            })
        let request = Task {
            try await fixture.refresher.refreshedCredentials(
                replacing: "access-1", at: owner.baseURL, ifRevision: owner.credentialRevision)
        }
        try await withDeadline { try await gate.waitForArrivals(atLeast: 1) }
        await gate.open()
        await #expect(throws: SessionRefreshError.unavailable("paired client identity changed")) {
            try await request.value
        }
        #expect(fixture.exchange.challengeCount == 0)
        #expect(fixture.session.events.isEmpty)
    }

    private func replace(_ fixture: RefresherFixture, baseURL: URL = PairedDevice.fake().baseURL)
        async throws -> PairedDevice
    {
        try await BFMDevicePairingService(
            credentialStore: fixture.credentialStore, exchange: { _ in ScriptedPairingExchange() }
        ).pair(.fake(baseURL: baseURL))
    }
    private func send(
        _ middleware: AuthenticatingMiddleware, through transport: RecordingTransport,
        baseURL: URL = PairedDevice.fake().baseURL
    ) async throws -> (HTTPResponse, HTTPBody?) {
        var request = HTTPRequest.mobile("/mobile/trips/7/captures/create")
        request.method = .post
        return try await middleware.intercept(
            request, body: nil, baseURL: baseURL, operationID: "mobileTripCaptures.create",
            next: transport.next)
    }
}

extension DeviceSessionRefresher {
    fileprivate func installJoinedRotationForTest(_ task: Task<CredentialTokenSnapshot, any Error>)
    { rotation = task }
}
