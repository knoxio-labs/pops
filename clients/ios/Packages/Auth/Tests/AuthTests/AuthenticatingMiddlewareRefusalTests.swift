import AppCore
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

    @Test("an unknown-length single-pass revocation is detected and its body stays readable")
    func unknownLengthSinglePassRevocationIsHandled() async throws {
        let fixture = try MiddlewareFixture()
        let payload = Array(#"{"code":"bfm.auth.device_revoked"}"#.utf8)
        let transport = RecordingTransport(
            respond: { _ in .forbidden },
            responseBody: { _ in Self.singlePassBody(payload) }
        )

        let (response, body) = try await fixture.sendResponse(through: transport)

        #expect(response.status == .forbidden)
        #expect(try await [UInt8](collecting: #require(body), upTo: 1_024) == payload)
        #expect(fixture.session.events == [.revoked(.revokedByOperator)])
        #expect(try fixture.tokenStore.load() == nil)
        #expect(try fixture.keyStore.publicKey() == nil)
        #expect(try fixture.pairedDeviceStore.load() == nil)
    }

    @Test("an unknown-length single-pass capability refusal keeps credentials and the body")
    func unknownLengthSinglePassCapabilityRefusalKeepsPairing() async throws {
        let fixture = try MiddlewareFixture()
        let payload = Array(
            #"{"code":"capability_not_granted","capability":"transactions.read"}"#.utf8)
        let transport = RecordingTransport(
            respond: { _ in .forbidden },
            responseBody: { _ in Self.singlePassBody(payload) }
        )

        let (response, body) = try await fixture.sendResponse(through: transport)

        #expect(response.status == .forbidden)
        #expect(try await [UInt8](collecting: #require(body), upTo: 1_024) == payload)
        #expect(fixture.session.events.isEmpty)
        #expect(try fixture.tokenStore.load() == .stub())
        #expect(try fixture.keyStore.publicKey() != nil)
        #expect(try fixture.pairedDeviceStore.load() == .fake())
    }

    @Test("an over-limit single-pass refusal remains readable and keeps credentials")
    func overLimitSinglePassRefusalIsReplayed() async throws {
        let fixture = try MiddlewareFixture()
        let prefix = Array(#"{"code":"capability_not_granted","details":""#.utf8)
        let payload = prefix + Array(repeating: 0x61, count: 1_048_576) + Array(#""}"#.utf8)
        let split = 1_048_576
        let transport = RecordingTransport(
            respond: { _ in .forbidden },
            responseBody: { _ in
                Self.singlePassBody([
                    ArraySlice(payload[..<split]),
                    ArraySlice(payload[split...]),
                ])
            }
        )

        let (response, body) = try await fixture.sendResponse(through: transport)

        #expect(response.status == .forbidden)
        #expect(
            try await [UInt8](collecting: #require(body), upTo: payload.count) == payload)
        #expect(fixture.session.events.isEmpty)
        #expect(try fixture.tokenStore.load() == .stub())
        #expect(try fixture.keyStore.publicKey() != nil)
        #expect(try fixture.pairedDeviceStore.load() == .fake())
    }

    @Test("a failing single-pass refusal replays its consumed prefix before rethrowing")
    func unreadableSinglePassRefusalReplaysPrefixBeforeFailure() async throws {
        let fixture = try MiddlewareFixture()
        let prefix = Array("not-json".utf8)
        let transport = RecordingTransport(
            respond: { _ in .forbidden },
            responseBody: { _ in Self.singlePassBodyFailingAfter(prefix) }
        )

        let (response, body) = try await fixture.sendResponse(through: transport)
        var iterator = try #require(body).makeAsyncIterator()

        #expect(response.status == .forbidden)
        #expect(try await iterator.next() == ArraySlice(prefix))
        await #expect(throws: RefusalBodyStreamFailure.self) { try await iterator.next() }
        #expect(fixture.session.events.isEmpty)
        #expect(try fixture.tokenStore.load() == .stub())
        #expect(try fixture.keyStore.publicKey() != nil)
        #expect(try fixture.pairedDeviceStore.load() == .fake())
    }

    private static func singlePassBody(_ bytes: [UInt8]) -> HTTPBody {
        singlePassBody([ArraySlice(bytes)])
    }

    private static func singlePassBody(_ chunks: [ArraySlice<UInt8>]) -> HTTPBody {
        let stream = AsyncStream<ArraySlice<UInt8>> { continuation in
            for chunk in chunks {
                continuation.yield(chunk)
            }
            continuation.finish()
        }
        return HTTPBody(stream, length: .unknown, iterationBehavior: .single)
    }

    private static func singlePassBodyFailingAfter(_ bytes: [UInt8]) -> HTTPBody {
        let stream = AsyncThrowingStream<ArraySlice<UInt8>, any Error> { continuation in
            continuation.yield(ArraySlice(bytes))
            continuation.finish(throwing: RefusalBodyStreamFailure())
        }
        return HTTPBody(stream, length: .unknown)
    }
}

private struct RefusalBodyStreamFailure: Error {}
