import Foundation
import Testing

@testable import BFMClient

@Suite
internal struct BFMEgoByteTransportTests {
    private struct ForbiddenAttempt {
        let opening: BFMEgoStreamOpening
        let source: ScriptedBFMByteSource
        let authorizer: RecordingBFMStreamAuthorizer
    }

    @Test
    func attachesBearerAndPreservesBaseURLPathPrefix() async throws {
        let baseURL = try #require(URL(string: "https://bfm.example/bfm-api/v1/"))
        let source = ScriptedBFMByteSource(replies: [
            .init(statusCode: 200, body: Data("stream".utf8))
        ])
        let authorizer = RecordingBFMStreamAuthorizer(accessToken: "access-1")
        let transport = BFMEgoByteTransport(
            baseURL: baseURL, authorizer: authorizer, source: source)

        let opening = try await transport.open(body: Data(#"{"message":"hello"}"#.utf8))

        guard case .streaming(let bytes) = opening else {
            Issue.record("expected a streaming response")
            return
        }
        #expect(try await Self.collect(bytes) == Data("stream".utf8))

        let requests = await source.recordedRequests()
        let request = try #require(requests.first)
        #expect(request.url?.path == "/bfm-api/v1/mobile/ego/chat/stream")
        #expect(request.method == "POST")
        #expect(request.authorization == "Bearer access-1")
        #expect(request.contentType == "application/json")
        #expect(request.accept == "text/event-stream")
        #expect(request.body == Data(#"{"message":"hello"}"#.utf8))
    }

    @Test
    func unauthorizedRequestRefreshesOnceAndRetriesWithNewToken() async throws {
        let baseURL = try #require(URL(string: "https://bfm.example/prefix"))
        let source = ScriptedBFMByteSource(replies: [
            .init(statusCode: 401),
            .init(statusCode: 200, body: Data("ok".utf8)),
        ])
        let authorizer = RecordingBFMStreamAuthorizer(accessToken: "access-1")
        let transport = BFMEgoByteTransport(
            baseURL: baseURL, authorizer: authorizer, source: source)

        let opening = try await transport.open(body: Data("{}".utf8))

        guard case .streaming(let bytes) = opening else {
            Issue.record("expected the retry response to stream")
            return
        }
        #expect(try await Self.collect(bytes) == Data("ok".utf8))
        #expect(
            await source.recordedRequests().map(\.authorization) == [
                "Bearer access-1", "Bearer access-2",
            ])
        #expect(
            await authorizer.recordedRefreshes() == [
                .init(staleAccessToken: "access-1", baseURL: baseURL)
            ])
    }

    @Test
    func secondUnauthorizedResponseIsReturnedWithoutAnotherRetry() async throws {
        let source = ScriptedBFMByteSource(replies: [
            .init(statusCode: 401), .init(statusCode: 401),
        ])
        let authorizer = RecordingBFMStreamAuthorizer(accessToken: "access-1")
        let transport = BFMEgoByteTransport(
            baseURL: try #require(URL(string: "https://bfm.example")),
            authorizer: authorizer,
            source: source
        )

        let opening = try await transport.open(body: Data())

        guard case .rejected(let status, _, _) = opening else {
            Issue.record("expected the second 401 to be returned")
            return
        }
        #expect(status == 401)
        #expect(await source.recordedRequests().count == 2)
        #expect(await authorizer.recordedRefreshes().count == 1)
    }

    @Test(
        "only the explicit device-revocation codes notify the authorizer",
        arguments: ["bfm.auth.device_revoked", "device_revoked"]
    )
    func revocationCodeNotifiesAuthorizer(code: String) async throws {
        let body = Data(#"{"code":"\#(code)"}"#.utf8)
        let attempt = try await Self.openForbidden(body: body)

        guard case .rejected(let status, _, _) = attempt.opening else {
            Issue.record("expected the 403 response to be returned")
            return
        }
        #expect(status == 403)
        #expect(await attempt.source.recordedRequests().count == 1)
        #expect(await attempt.authorizer.revocationCount() == 1)
    }

    @Test(
        "capability and unknown 403 codes never revoke the device",
        arguments: ["capability_not_granted", "future.refusal"]
    )
    func nonRevocation403DoesNotNotifyAuthorizer(code: String) async throws {
        let body = Data(#"{"code":"\#(code)"}"#.utf8)
        let attempt = try await Self.openForbidden(body: body)

        guard case .rejected(let status, _, _) = attempt.opening else {
            Issue.record("expected the 403 response to be returned")
            return
        }
        #expect(status == 403)
        #expect(await attempt.source.recordedRequests().count == 1)
        #expect(await attempt.authorizer.revocationCount() == 0)
    }

    @Test
    func missingTokenIsSentUnauthenticatedWithoutRefresh() async throws {
        let source = ScriptedBFMByteSource(replies: [.init(statusCode: 401)])
        let authorizer = RecordingBFMStreamAuthorizer(accessToken: nil)
        let transport = BFMEgoByteTransport(
            baseURL: try #require(URL(string: "https://bfm.example")),
            authorizer: authorizer,
            source: source
        )

        let opening = try await transport.open(body: Data())

        guard case .rejected(let status, _, _) = opening else {
            Issue.record("expected the unauthenticated 401 to be returned")
            return
        }
        #expect(status == 401)
        #expect(await source.recordedRequests().first?.authorization == nil)
        #expect(await authorizer.recordedRefreshes().isEmpty)
    }

    @Test
    func retryAfterAndRejectionBodyAreBoundedAndTokenRedacted() async throws {
        let token = "access-secret-1"
        var responseBody = Data("proxy echoed \(token):".utf8)
        responseBody.append(Data(repeating: 0x78, count: 70_000))
        let source = ScriptedBFMByteSource(replies: [
            .init(statusCode: 429, headers: ["Retry-After": "30"], body: responseBody)
        ])
        let transport = BFMEgoByteTransport(
            baseURL: try #require(URL(string: "https://bfm.example")),
            authorizer: RecordingBFMStreamAuthorizer(accessToken: token),
            source: source
        )

        let opening = try await transport.open(body: Data())

        guard case .rejected(let status, let retryAfter, let body) = opening else {
            Issue.record("expected the 429 response to be returned")
            return
        }
        #expect(status == 429)
        #expect(retryAfter == 30)
        #expect(body.count <= 64 * 1024)
        #expect(body.range(of: Data(token.utf8)) == nil)
        #expect(!String(describing: opening).contains(token))
    }

    @Test
    func refreshFailurePropagatesWithoutAnotherRequest() async throws {
        let token = "access-secret-2"
        let source = ScriptedBFMByteSource(replies: [.init(statusCode: 401)])
        let authorizer = RecordingBFMStreamAuthorizer(
            accessToken: token, refreshBehavior: .fails)
        let transport = BFMEgoByteTransport(
            baseURL: try #require(URL(string: "https://bfm.example")),
            authorizer: authorizer,
            source: source
        )

        await #expect(throws: StreamAuthorizerTestFailure.refreshFailed) {
            try await transport.open(body: Data())
        }
        #expect(await source.recordedRequests().count == 1)
        #expect(await authorizer.recordedRefreshes().count == 1)
    }

    private static func openForbidden(body: Data) async throws -> ForbiddenAttempt {
        let source = ScriptedBFMByteSource(replies: [
            .init(statusCode: 403, body: body)
        ])
        let authorizer = RecordingBFMStreamAuthorizer(accessToken: "access-1")
        let transport = BFMEgoByteTransport(
            baseURL: try #require(URL(string: "https://bfm.example")),
            authorizer: authorizer,
            source: source
        )
        return ForbiddenAttempt(
            opening: try await transport.open(body: Data()),
            source: source,
            authorizer: authorizer
        )
    }

    private static func collect(
        _ stream: AsyncThrowingStream<[UInt8], any Error>
    ) async throws -> Data {
        var data = Data()
        for try await chunk in stream {
            data.append(contentsOf: chunk)
        }
        return data
    }
}
