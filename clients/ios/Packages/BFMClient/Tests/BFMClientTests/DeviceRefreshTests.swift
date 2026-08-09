import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing

@testable import BFMClient

/// Holds the one request body a test needs to look at afterwards. An actor for
/// the reason `RecordedRequests` is one: `ClientTransport.send` is `Sendable`
/// and non-mutating, so there is nowhere else to put it.
private actor SentBody {
    private(set) var value: Data?

    func record(_ body: Data) {
        value = body
    }
}

/// The refresh pair's seam: what the façade does with every response the
/// contract documents, and — the part that carries the weight — what it does
/// with the two statuses whose meaning it refuses to guess.
@Suite("BFMHTTPClient refresh")
internal struct DeviceRefreshTests {
    private static let challengeBody = #"{"nonce":"n-1","expiresIn":30}"#
    private static let refreshedBody = """
        {"accessToken":"access-2","refreshToken":"refresh-2","expiresIn":900}
        """

    private func client(_ transport: StubTransport) throws -> BFMHTTPClient {
        BFMHTTPClient(
            baseURL: try #require(URL(string: "https://bfm.example")), transport: transport)
    }

    private func refresh(_ transport: StubTransport) async throws -> RefreshedSession {
        try await client(transport).refresh(
            refreshToken: "refresh-1",
            nonce: "n-1",
            signatureBase64: "MEYCIQD5"
        )
    }

    @Test("a 201 becomes a RefreshChallenge")
    func challengeIsMapped() async throws {
        let transport = StubTransport(status: .created, json: Self.challengeBody)

        let challenge = try await client(transport).challenge()

        #expect(challenge.nonce == "n-1")
        #expect(challenge.expiresInSeconds == 30)
    }

    @Test("a 200 becomes a RefreshedSession")
    func refreshIsMapped() async throws {
        let session = try await refresh(StubTransport(status: .ok, json: Self.refreshedBody))

        #expect(session.accessToken == "access-2")
        #expect(session.refreshToken == "refresh-2")
        #expect(session.expiresInSeconds == 900)
    }

    /// All three fields, because the BFM needs every one of them to verify: the
    /// grant it looks the row up by, the nonce it spends, and the proof the
    /// handset still holds its key. A missing one is a `401` that looks exactly
    /// like an expired token.
    @Test("the request carries the credential, the nonce and the signature")
    func refreshSendsWhatTheServerVerifies() async throws {
        let sent = SentBody()
        let transport = StubTransport { _, body in
            await sent.record(try await Data(collecting: body ?? HTTPBody(), upTo: 1 << 16))
            return (
                HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]),
                HTTPBody(Self.refreshedBody)
            )
        }

        _ = try await refresh(transport)

        let body = try #require(await sent.value)
        let payload = try #require(JSONSerialization.jsonObject(with: body) as? [String: String])
        #expect(payload["refreshToken"] == "refresh-1")
        #expect(payload["nonce"] == "n-1")
        #expect(payload["signature"] == "MEYCIQD5")
        #expect(await transport.recorded.all.map(\.operationID) == ["device.refresh"])
    }

    @Test(
        "each documented refusal reaches the caller as its own DeviceRefreshRefusal",
        arguments: [
            (
                HTTPResponse.Status.unauthorized, #"{"code":"challenge_expired","message":"x"}"#,
                DeviceRefreshRefusal.challengeExpired
            ),
            (.unauthorized, #"{"code":"invalid_grant","message":"x"}"#, .invalidGrant),
            (.forbidden, #"{"code":"device_revoked","message":"x"}"#, .deviceRevoked),
            (.badRequest, #"{"code":"invalid_request","message":"x"}"#, .invalidRequest),
            (
                .tooManyRequests,
                #"{"code":"rate_limited","message":"x","retryAfterSeconds":7}"#,
                .rateLimited(retryAfterSeconds: 7)
            ),
        ]
    )
    func documentedRefusalsAreMapped(
        status: HTTPResponse.Status,
        json: String,
        expected: DeviceRefreshRefusal
    ) async throws {
        await #expect(throws: BFMClientError.refreshRefused(expected)) {
            try await refresh(StubTransport(status: status, json: json))
        }
    }

    @Test("an undocumented status is named rather than mistaken for a success")
    func undocumentedStatusBecomesAnError() async throws {
        await #expect(
            throws: BFMClientError.undocumentedResponse(
                operation: "device.refresh",
                statusCode: 502
            )
        ) {
            try await refresh(StubTransport(status: .badGateway, json: "<html>bad gateway</html>"))
        }
    }

    // MARK: - The statuses this client will not guess at

    /// A `429` whose body is an intermediary's HTML page still means "back
    /// off", and saying so costs nothing that can go wrong.
    @Test("an unreadable 429 is still a rate limit")
    func unreadableRateLimitIsStillActionable() async throws {
        await #expect(throws: BFMClientError.refreshRefused(.rateLimited(retryAfterSeconds: nil))) {
            try await refresh(
                StubTransport(status: .tooManyRequests, json: "<html>slow down</html>"))
        }
    }

    /// The asymmetry with `pairDevice`, which *does* infer `codeRejected` from a
    /// bare `403`. There, being wrong costs one retyped code. Here, `401` read
    /// as `invalidGrant` ends a session and `403` read as `deviceRevoked` wipes
    /// a keychain — and Cloudflare Access answers exactly those two statuses
    /// with exactly such a page. So an unreadable one stays a transport
    /// failure, which `Auth` retries and revokes nothing for.
    @Test(
        "an unreadable 401 or 403 is a transport failure, not a revocation",
        arguments: [HTTPResponse.Status.unauthorized, .forbidden]
    )
    func unreadableAuthStatusesAreNotInferred(status: HTTPResponse.Status) async throws {
        let error = await #expect(throws: BFMClientError.self) {
            try await refresh(StubTransport(status: status, json: "<html>access denied</html>"))
        }

        guard case .transportFailure(let operation, _) = error else {
            Issue.record("expected a transport failure, got \(String(describing: error))")
            return
        }
        #expect(operation == "device.refresh")
    }

    // MARK: - Redaction

    /// `OpenAPIRuntime.ClientError` renders `operationInput` by reflection, and
    /// for this operation that input *is* the refresh token and the signature.
    /// Nothing carrying it may leave this module, because one `"\(error)"` in a
    /// `catch` downstream is all it takes.
    @Test("no error this call throws renders the credential it sent")
    func errorsCarryNoCredential() async throws {
        var rendered: [String] = []
        for status in [HTTPResponse.Status.unauthorized, .forbidden, .internalServerError] {
            do {
                _ = try await refresh(StubTransport(status: status, json: "<html>nope</html>"))
            } catch {
                rendered.append("\(error) \(String(describing: error))")
            }
        }

        #expect(rendered.count == 3)
        for line in rendered {
            #expect(!line.contains("refresh-1"), "the refresh token reached a rendered error")
            #expect(!line.contains("MEYCIQD5"), "the signature reached a rendered error")
        }
    }

    @Test("a refreshed session does not print its tokens")
    func refreshedSessionIsRedacted() async throws {
        let session = try await refresh(StubTransport(status: .ok, json: Self.refreshedBody))

        #expect("\(session)" == "RefreshedSession(redacted)")
        #expect(String(reflecting: session) == "RefreshedSession(redacted)")
    }
}
