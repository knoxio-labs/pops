import AppCore
import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing

@testable import BFMClient

@Suite("BFM runtime error decoding")
internal struct RuntimeErrorDecodingTests {
    private func service(
        transport: any ClientTransport,
        middlewares: [any ClientMiddleware] = []
    ) throws -> BFMBootstrapService {
        BFMBootstrapService(
            client: BFMHTTPClient(
                baseURL: try #require(URL(string: "https://bfm.example")),
                transport: transport,
                middlewares: middlewares
            )
        )
    }

    private func failure(
        transport: any ClientTransport,
        middlewares: [any ClientMiddleware] = []
    ) async throws -> PopsError {
        let thrown = await #expect(throws: RepositoryError.self) {
            try await service(transport: transport, middlewares: middlewares).bootstrap()
        }
        guard case .transport(let transportError) = try #require(thrown),
            let popsError = transportError.popsError
        else {
            Issue.record("expected a structured POPS error, got \(String(describing: thrown))")
            throw TestFailure.wrongRepositoryError
        }
        return popsError
    }

    @Test("an ADR-054 upstream outage envelope maps to unavailable")
    func decodesEnvelope() async throws {
        let transport = StubTransport { _, _ in
            var fields = HTTPFields()
            fields[try #require(HTTPField.Name("X-Request-Id"))] = "header-request"
            return (
                HTTPResponse(status: .serviceUnavailable, headerFields: fields),
                HTTPBody(
                    #"""
                    {
                      "code":"gateway.upstream_unavailable",
                      "message":"Inventory is unavailable.",
                      "requestId":"body-request",
                      "retryable":true
                    }
                    """#
                )
            )
        }

        await #expect(throws: RepositoryError.unavailable) {
            try await service(transport: transport).bootstrap()
        }
    }

    @Test("a non-envelope response falls back to its HTTP status")
    func fallsBackToStatus() async throws {
        let error = try await failure(
            transport: StubTransport(status: .init(code: 418), json: "<html>no</html>")
        )

        #expect(error.code == "ios.http.418")
        #expect(error.kind == .client)
        #expect(!error.retryable)
    }

    @Test(
        "URL failures distinguish offline from timeout",
        arguments: [
            (URLError.Code.notConnectedToInternet, "ios.net.offline", PopsError.Kind.offline),
            (.timedOut, "ios.net.timeout", .timeout),
        ]
    )
    func classifiesURLFailure(
        urlCode: URLError.Code,
        expectedCode: String,
        expectedKind: PopsError.Kind
    ) async throws {
        let error = try await failure(
            transport: StubTransport { _, _ in throw URLError(urlCode) }
        )

        #expect(error.code == expectedCode)
        #expect(error.kind == expectedKind)
        #expect(error.retryable)
    }

    @Test("a malformed success is classified as a decode failure")
    func classifiesMalformedSuccess() async throws {
        let error = try await failure(
            transport: StubTransport(status: .ok, json: #"{"device":"not-an-object"}"#)
        )

        #expect(error.code == "ios.decode.failed")
        #expect(error.kind == .client)
        #expect(!error.retryable)
    }

    @Test("runtime errors never retain an authorization token")
    func doesNotLeakToken() async throws {
        let token = "secret-access-token"
        let error = try await failure(
            transport: StubTransport { _, _ in throw URLError(.notConnectedToInternet) },
            middlewares: [TokenMiddleware(token: token)]
        )

        let encoded = try #require(
            String(data: try JSONEncoder().encode(error), encoding: .utf8)
        )
        #expect(!encoded.contains(token))
        #expect(!String(describing: error).contains(token))
        #expect(!error.localizedDescription.contains(token))
    }
}

private struct TokenMiddleware: ClientMiddleware {
    let token: String

    func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        var request = request
        request.headerFields[.authorization] = "Bearer \(token)"
        return try await next(request, body, baseURL)
    }
}

private enum TestFailure: Error {
    case wrongRepositoryError
}
