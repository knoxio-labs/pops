import AppCore
import BFMClient
import HTTPTypes
import OpenAPIRuntime
import Testing

@testable import Auth

@Suite("AuthenticatingMiddleware refusals")
internal struct AuthenticatingMiddlewareRefusalTests {
    @Test("an explicit device revocation wipes the device and never attempts a refresh")
    func revokedDeviceIsWipedWithoutRefreshing() async throws {
        let fixture = try MiddlewareFixture()
        let transport = RecordingTransport(
            respond: { _ in .forbidden },
            responseBody: { _ in
                HTTPBody(Array(#"{"code":"bfm.auth.device_revoked","message":"revoked"}"#.utf8))
            }
        )

        let response = try await fixture.send(through: transport)

        #expect(response.status == .forbidden)
        #expect(transport.attempts.count == 1)
        #expect(fixture.exchange.challengeCount == 0, "403 must not cost a refresh round trip")
        #expect(fixture.session.events == [.revoked(.revokedByOperator)])
        #expect(try fixture.tokenStore.load() == nil)
        #expect(try fixture.keyStore.publicKey() == nil)
        #expect(try fixture.pairedDeviceStore.load() == nil)
    }

    @Test("a capability refusal keeps a valid pairing and returns the original body")
    func capabilityRefusalKeepsCredentials() async throws {
        let fixture = try MiddlewareFixture()
        let payload =
            #"{"code":"capability_not_granted","capability":"purchases.read","message":"not granted"}"#
        let transport = RecordingTransport(
            respond: { _ in .forbidden },
            responseBody: { _ in HTTPBody(Array(payload.utf8)) }
        )

        let (response, body) = try await fixture.sendResponse(through: transport)

        #expect(response.status == .forbidden)
        #expect(transport.attempts.count == 1)
        #expect(fixture.exchange.challengeCount == 0)
        #expect(fixture.session.events.isEmpty)
        #expect(try fixture.tokenStore.load() == .stub())
        #expect(try fixture.keyStore.publicKey() != nil)
        #expect(try fixture.pairedDeviceStore.load() == .fake())
        let responseBytes = try await [UInt8](collecting: #require(body), upTo: 1_024)
        #expect(responseBytes == Array(payload.utf8))
    }

    @Test("an unreadable 403 does not revoke the device")
    func unreadableForbiddenKeepsCredentials() async throws {
        let fixture = try MiddlewareFixture()
        let payload = "not-json"
        let transport = RecordingTransport(
            respond: { _ in .forbidden },
            responseBody: { _ in HTTPBody(Array(payload.utf8)) }
        )

        let (response, body) = try await fixture.sendResponse(through: transport)

        #expect(response.status == .forbidden)
        #expect(fixture.session.events.isEmpty)
        #expect(try fixture.tokenStore.load() == .stub())
        #expect(try fixture.keyStore.publicKey() != nil)
        #expect(try fixture.pairedDeviceStore.load() == .fake())
        let responseBytes = try await [UInt8](collecting: #require(body), upTo: 1_024)
        #expect(responseBytes == Array(payload.utf8))
    }

    /// A revocation that lands between the two attempts. Handled without
    /// recursing, so the number of requests this middleware can make stays two.
    @Test("an explicit device revocation on the retry still wipes credentials")
    func revocationBetweenTheTwoAttempts() async throws {
        let fixture = try MiddlewareFixture()
        let transport = RecordingTransport(
            respond: { request in
                request.headerFields[.authorization] == "Bearer access-1"
                    ? .unauthorized : .forbidden
            },
            responseBody: { request in
                guard request.headerFields[.authorization] == "Bearer access-2" else { return nil }
                return HTTPBody(
                    Array(#"{"code":"bfm.auth.device_revoked","message":"revoked"}"#.utf8))
            }
        )

        let response = try await fixture.send(through: transport)

        #expect(response.status == .forbidden)
        #expect(transport.attempts.count == 2)
        #expect(fixture.session.events == [.revoked(.revokedByOperator)])
        #expect(try fixture.tokenStore.load() == nil)
    }

    @Test("an unknown-length single-pass refusal body is returned without consuming it")
    func unknownLengthSinglePassBodyRemainsReadable() async throws {
        let fixture = try MiddlewareFixture()
        let payload = Array(#"{"code":"bfm.auth.device_revoked"}"#.utf8)
        let stream = AsyncStream<ArraySlice<UInt8>> { continuation in
            continuation.yield(ArraySlice(payload))
            continuation.finish()
        }
        let originalBody = HTTPBody(stream, length: .unknown, iterationBehavior: .single)
        let transport = RecordingTransport(
            respond: { _ in .forbidden },
            responseBody: { _ in originalBody }
        )

        let (response, body) = try await fixture.sendResponse(through: transport)

        #expect(response.status == .forbidden)
        #expect(body == originalBody)
        #expect(try await [UInt8](collecting: #require(body), upTo: 1_024) == payload)
        #expect(fixture.session.events.isEmpty)
        #expect(try fixture.tokenStore.load() == .stub())
        #expect(try fixture.keyStore.publicKey() != nil)
        #expect(try fixture.pairedDeviceStore.load() == .fake())
    }
}
