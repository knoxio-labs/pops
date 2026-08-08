import Foundation
import HTTPTypes
import OpenAPIRuntime

/// A `ClientTransport` that answers from a closure and remembers what it was
/// asked.
///
/// Substituted at ``BFMHTTPClient``'s internal initialiser, which is the only
/// reason these tests do not have to stub `URLProtocol` — a
/// `URLProtocol` subclass is process-global mutable state that leaks between
/// tests when one of them fails before tearing it down.
internal struct StubTransport: ClientTransport {
    internal let recorded: RecordedRequests
    private let respond:
        @Sendable (HTTPRequest, HTTPBody?) async throws -> (HTTPResponse, HTTPBody?)

    internal init(
        respond:
            @escaping @Sendable (HTTPRequest, HTTPBody?) async throws -> (
                HTTPResponse, HTTPBody?
            )
    ) {
        self.recorded = RecordedRequests()
        self.respond = respond
    }

    /// Answers every request with one status and body.
    internal init(status: HTTPResponse.Status, json: String) {
        self.init { _, _ in
            (
                HTTPResponse(status: status, headerFields: [.contentType: "application/json"]),
                HTTPBody(json)
            )
        }
    }

    internal func send(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String
    ) async throws -> (HTTPResponse, HTTPBody?) {
        await recorded.append(Sent(request: request, baseURL: baseURL, operationID: operationID))
        return try await respond(request, body)
    }
}

/// One call the client made.
internal struct Sent: Sendable {
    internal let request: HTTPRequest
    internal let baseURL: URL
    internal let operationID: String
}

/// An actor rather than a `var` on the transport: `ClientTransport.send` is
/// `Sendable` and non-mutating, so there is nowhere on a struct to put this that
/// Swift 6 will accept.
internal actor RecordedRequests {
    internal private(set) var all: [Sent] = []

    internal func append(_ sent: Sent) {
        all.append(sent)
    }
}
