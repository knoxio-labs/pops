import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing

@testable import BFMClient

/// A middleware that stamps a header and remembers that it ran. Stands in for
/// `Auth`'s authenticating one, which this module cannot see and must not need
/// to in order to prove the seam works.
private struct StampingMiddleware: ClientMiddleware {
    static let headerValue = "Bearer not-a-real-token"

    func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        var stamped = request
        stamped.headerFields[.authorization] = Self.headerValue
        return try await next(stamped, body, baseURL)
    }
}

/// The seam `Auth` reaches the generated client through.
@Suite("BFMHTTPClient middlewares")
internal struct MiddlewareSeamTests {
    private static let healthBody = """
        {"ok":true,"status":"ok","pillar":"bfm","version":"1.0.0",\
        "ts":"2026-08-08T11:19:25Z"}
        """

    private func baseURL() throws -> URL {
        try #require(URL(string: "https://bfm.example"))
    }

    @Test("a middleware runs before the transport and can rewrite the request")
    func middlewaresAreInvoked() async throws {
        let transport = StubTransport(status: .ok, json: Self.healthBody)
        let client = BFMHTTPClient(
            baseURL: try baseURL(),
            transport: transport,
            middlewares: [StampingMiddleware()]
        )

        _ = try await client.health()

        let sent = try #require(await transport.recorded.all.first)
        #expect(sent.request.headerFields[.authorization] == StampingMiddleware.headerValue)
    }

    @Test("no middleware means no header, so the seam is opt-in")
    func withoutMiddlewaresNothingIsAttached() async throws {
        let transport = StubTransport(status: .ok, json: Self.healthBody)

        _ = try await BFMHTTPClient(baseURL: try baseURL(), transport: transport).health()

        let sent = try #require(await transport.recorded.all.first)
        #expect(sent.request.headerFields[.authorization] == nil)
    }

    /// `AuthenticatingMiddleware` states this as the reason it does not have to
    /// redact anything itself, and it is a property of `swift-openapi-runtime`
    /// rather than of any code in this repo — so it is asserted here rather
    /// than assumed. `UniversalClient` builds its `ClientError` from the
    /// request the *serializer* produced, which a middleware has not touched.
    ///
    /// If a runtime bump ever changed that, every access token this app sends
    /// would start appearing in the description of every transport error, and
    /// nothing else in the tree would notice.
    @Test("a transport failure does not render a header a middleware added")
    func transportErrorsCarryNoMiddlewareHeader() async throws {
        struct Dead: Error {}
        let client = BFMHTTPClient(
            baseURL: try baseURL(),
            transport: StubTransport { _, _ in throw Dead() },
            middlewares: [StampingMiddleware()]
        )

        var rendered = ""
        do {
            _ = try await client.health()
        } catch {
            rendered = "\(error) \(String(describing: error))"
        }

        #expect(!rendered.isEmpty)
        #expect(!rendered.contains("not-a-real-token"))
    }
}
