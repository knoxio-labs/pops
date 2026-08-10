import AppCore
import BFMClient
import HTTPTypes
import Security
import Testing

@testable import Auth

/// What the middleware does with each status, one request at a time.
///
/// The assertions are mostly about the *attempts* it made rather than the value
/// it returned, because the defects this code has are all about how many
/// requests it sent and what each one carried: a retry with the stale token, a
/// third attempt, a refresh attempted from inside a refresh.
@Suite("AuthenticatingMiddleware")
internal struct AuthenticatingMiddlewareTests {
    @Test("the stored access token is attached to a mobile request")
    func attachesTheToken() async throws {
        let fixture = try MiddlewareFixture()
        let transport = RecordingTransport { _ in .ok }

        let response = try await fixture.send(through: transport)

        #expect(response.status == .ok)
        #expect(transport.attempts.map(\.authorization) == ["Bearer access-1"])
        #expect(fixture.exchange.challengeCount == 0)
    }

    /// An allowlist, not a denylist. `POST /devices/refresh` answers `401` and
    /// `403` like anything else, so a middleware that acted on those statuses
    /// everywhere could attempt a refresh from inside a refresh — and it would
    /// do so only in production, where the two clients share a composition root.
    @Test(
        "nothing outside the mobile surface is touched",
        arguments: ["/devices/refresh", "/devices/challenge", "/devices/pair", "/health"]
    )
    func leavesUnauthenticatedSurfacesAlone(path: String) async throws {
        let fixture = try MiddlewareFixture()
        let transport = RecordingTransport { _ in .unauthorized }

        let response = try await fixture.send(.mobile(path), through: transport)

        #expect(response.status == .unauthorized)
        #expect(transport.attempts.map(\.authorization) == [nil])
        #expect(fixture.exchange.challengeCount == 0, "a refresh was attempted off /mobile")
    }

    /// The allowlist is a rule about what leaves this app, not just about what
    /// this type adds. It matters most on exactly these paths: the BFM's device
    /// surface answers on the hostname where Cloudflare Access is *bypassed*,
    /// so a bearer token sent there travels with less in front of it than
    /// anywhere else — and no route under it has ever needed one.
    @Test(
        "an Authorization header is stripped off the unauthenticated surface",
        arguments: ["/devices/refresh", "/devices/challenge", "/devices/pair", "/health"]
    )
    func stripsCredentialsOffTheUnauthenticatedSurface(path: String) async throws {
        let fixture = try MiddlewareFixture()
        let transport = RecordingTransport { _ in .ok }
        var request = HTTPRequest.mobile(path)
        request.headerFields[.authorization] = "Bearer leaked-by-another-middleware"

        _ = try await fixture.send(request, through: transport)

        #expect(transport.attempts.map(\.authorization) == [nil])
    }

    @Test("an unpaired device sends the request rather than inventing a failure")
    func sendsWithoutCredentialsWhenUnpaired() async throws {
        let fixture = try MiddlewareFixture(tokens: nil)
        let transport = RecordingTransport { _ in .unauthorized }

        let response = try await fixture.send(through: transport)

        #expect(response.status == .unauthorized)
        #expect(transport.attempts.map(\.authorization) == [nil])
    }

    /// "Unauthenticated" has to mean the header is gone, not merely that this
    /// middleware declined to add one. Nothing writes it today — the contract
    /// declares no security scheme — but middlewares compose, and a promise
    /// that holds only because nobody else happened to write the header is a
    /// promise that holds by luck.
    @Test("an unpaired device strips an Authorization header the request arrived with")
    func clearsAnInboundAuthorizationHeaderWhenUnpaired() async throws {
        let fixture = try MiddlewareFixture(tokens: nil)
        let transport = RecordingTransport { _ in .unauthorized }
        var request = HTTPRequest.mobile()
        request.headerFields[.authorization] = "Bearer someone-elses-token"

        _ = try await fixture.send(request, through: transport)

        #expect(transport.attempts.map(\.authorization) == [nil])
    }

    /// The stuck state: a stored blob that no longer decodes.
    ///
    /// Without an escalation here the middleware takes the unpaired branch on
    /// every request — sends unauthenticated, collects a `401`, and returns it
    /// without ever reaching a refresh — while the session still says `paired`.
    /// The app would show a signed-in shell over credentials that can never
    /// work again, with nothing telling anyone to pair. Permanent, and reachable
    /// by installing an older build over a newer one.
    @Test("an undecodable stored blob ends the session instead of failing forever")
    func corruptedCredentialsEndTheSession() async throws {
        let fixture = try MiddlewareFixture(
            tokenStore: UnreadableTokenStore(failing: .corruptedPayload)
        )
        let transport = RecordingTransport { _ in .unauthorized }

        let response = try await fixture.send(through: transport)

        #expect(response.status == .unauthorized)
        #expect(transport.attempts.map(\.authorization) == [nil])
        #expect(fixture.session.events == [.revoked(.credentialsRejected)])
    }

    /// And it says so once, not once per request.
    @Test("twenty requests against a corrupt keychain report it once")
    func corruptedCredentialsReportedOnce() async throws {
        let fixture = try MiddlewareFixture(
            tokenStore: UnreadableTokenStore(failing: .corruptedPayload)
        )
        let transport = RecordingTransport { _ in .unauthorized }

        for index in 0..<20 {
            _ = try await fixture.send(.mobile("/mobile/bootstrap?i=\(index)"), through: transport)
        }

        #expect(fixture.session.events == [.revoked(.credentialsRejected)])
    }

    /// The contrast that keeps the rule honest: a locked handset is normal for
    /// background work and must not end anything.
    @Test("an unreadable keychain sends unauthenticated without ending the session")
    func lockedKeychainDoesNotEndTheSession() async throws {
        let fixture = try MiddlewareFixture(
            tokenStore: UnreadableTokenStore(failing: .keychain(errSecInteractionNotAllowed))
        )
        let transport = RecordingTransport { _ in .unauthorized }

        _ = try await fixture.send(through: transport)

        #expect(transport.attempts.map(\.authorization) == [nil])
        #expect(fixture.session.events.isEmpty, "a locked device was signed out")
    }

    // MARK: - 401

    @Test("a 401 refreshes once and the retry carries the new token")
    func refreshesAndRetries() async throws {
        let fixture = try MiddlewareFixture()
        let transport = RecordingTransport.rejecting("access-1")

        let response = try await fixture.send(through: transport)

        #expect(response.status == .ok)
        #expect(transport.attempts.map(\.authorization) == ["Bearer access-1", "Bearer access-2"])
        #expect(fixture.exchange.spends.count == 1)
        #expect(try fixture.tokenStore.load()?.refreshToken == "refresh-2")
    }

    /// The whole of the loop protection, and it is structural: there is no
    /// counter to get wrong because there is no third attempt to make.
    @Test("a 401 on the retry escalates instead of looping")
    func doesNotLoopOnASecondRejection() async throws {
        let fixture = try MiddlewareFixture()
        let transport = RecordingTransport { _ in .unauthorized }

        let response = try await fixture.send(through: transport)

        #expect(response.status == .unauthorized)
        #expect(transport.attempts.count == 2)
        #expect(fixture.exchange.spends.count == 1)
    }

    @Test("a refusal to refresh ends the session and does not retry")
    func failedRefreshEndsTheSession() async throws {
        let fixture = try MiddlewareFixture(
            exchange: ScriptedRefreshExchange(
                refreshes: [.failure(BFMClientError.refreshRefused(.invalidGrant))]
            )
        )
        let transport = RecordingTransport { _ in .unauthorized }

        await #expect(throws: SessionRefreshError.credentialsRejected) {
            _ = try await fixture.send(through: transport)
        }

        #expect(transport.attempts.count == 1, "no retry after a refresh that failed")
        #expect(fixture.session.events == [.revoked(.credentialsRejected)])
    }

    @Test("an unreachable BFM leaves the credentials and the session alone")
    func transportFailureDuringRefreshChangesNothing() async throws {
        let fixture = try MiddlewareFixture(
            exchange: ScriptedRefreshExchange(
                challenges: [
                    .failure(
                        BFMClientError.transportFailure(
                            operation: "device.challenge",
                            summary: "offline"
                        )
                    )
                ]
            )
        )
        let transport = RecordingTransport { _ in .unauthorized }

        await #expect(throws: SessionRefreshError.self) {
            _ = try await fixture.send(through: transport)
        }

        #expect(fixture.session.events.isEmpty)
        #expect(try fixture.tokenStore.load() == .stub())
    }

    // MARK: - 403

    @Test("a 403 wipes the device and never attempts a refresh")
    func revokedDeviceIsWipedWithoutRefreshing() async throws {
        let fixture = try MiddlewareFixture()
        let transport = RecordingTransport { _ in .forbidden }

        let response = try await fixture.send(through: transport)

        #expect(response.status == .forbidden)
        #expect(transport.attempts.count == 1)
        #expect(fixture.exchange.challengeCount == 0, "403 must not cost a refresh round trip")
        #expect(fixture.session.events == [.revoked(.revokedByOperator)])
        #expect(try fixture.tokenStore.load() == nil)
        #expect(try fixture.keyStore.publicKey() == nil)
    }

    /// A revocation that lands between the two attempts. Handled without
    /// recursing, so the number of requests this middleware can make stays two.
    @Test("a 403 on the retry is still a revocation")
    func revocationBetweenTheTwoAttempts() async throws {
        let fixture = try MiddlewareFixture()
        let transport = RecordingTransport { request in
            request.headerFields[.authorization] == "Bearer access-1" ? .unauthorized : .forbidden
        }

        let response = try await fixture.send(through: transport)

        #expect(response.status == .forbidden)
        #expect(transport.attempts.count == 2)
        #expect(fixture.session.events == [.revoked(.revokedByOperator)])
        #expect(try fixture.tokenStore.load() == nil)
    }
}
