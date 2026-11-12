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
    @Test(
        "optional malformed or unrelated upstream diagnostics never replace the original error",
        arguments: [
            "null", "[]", "42", #"{"other":"retained elsewhere"}"#,
            #"{"upstream":{"pillar":"trips","status":99}}"#,
            #"{"upstream":{"pillar":"trips","status":600}}"#,
            #"{"upstream":{"pillar":"trips","status":"404"}}"#,
        ])
    func malformedProvenance(details: String) async throws {
        let runtime = try await runtime(details: details)
        #expect(runtime.upstream == nil)
        #expect(runtime.popsError.code == "domain.refused")
        #expect(runtime.popsError.message == "Original refusal")
        #expect(runtime.popsError.requestID == "original-request")
        #expect(runtime.popsError.retryable)
        #expect(runtime.statusCode == 418)
        #expect(runtime.retryAfterSeconds == 37)
    }

    @Test(
        "typed upstream diagnostics preserve only protocol-valid pillar and status",
        arguments: [100, 404, 599])
    func typedProvenance(status: Int) async throws {
        let runtime = try await runtime(
            details:
                #"{"upstream":{"pillar":"trips","status":\#(status)},"unrelated":{"value":"not retained"}}"#
        )
        #expect(runtime.upstream?.pillar == "trips")
        #expect(runtime.upstream?.status == status)
        #expect(runtime.popsError.code == "domain.refused")
        #expect(runtime.retryAfterSeconds == 37)
    }

    private func runtime(details: String) async throws -> BFMRuntimePopsError {
        let wire = """
            {"code":"domain.refused","message":"Original refusal","requestId":"original-request",
            "retryable":true,"retryAfterSeconds":37,"details":\(details)}
            """
        let client = BFMHTTPClient(
            baseURL: try #require(URL(string: "https://bfm.example")),
            transport: StubTransport(status: .init(code: 418), json: wire))
        do {
            _ = try await client.generated.mobile_bootstrap()
        } catch let error as ClientError {
            return try #require(error.underlyingError as? BFMRuntimePopsError)
        }
        throw TestFailure.wrongRepositoryError
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
