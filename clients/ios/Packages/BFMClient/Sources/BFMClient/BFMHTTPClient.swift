import Foundation
import OpenAPIRuntime
import OpenAPIURLSession

/// A response the contract does not describe.
///
/// The generated client turns any undocumented status into a `.undocumented`
/// case rather than an error, which is the right default for a generator and
/// the wrong one for a caller: it makes "the BFM returned 502" indistinguishable
/// from a successful call whose body nobody looked at. Every such case is
/// converted here.
public enum BFMClientError: Error, Hashable, Sendable {
    /// A status code the OpenAPI snapshot does not document for this operation.
    case undocumentedResponse(operation: String, statusCode: Int)
}

/// The BFM, as this app calls it.
///
/// One instance per base URL. Where that URL comes from is
/// ``BuiltInBaseURL``'s problem in Debug and the pairing store's in Release —
/// this type is handed one and does not go looking.
///
/// Carries no credentials. Attaching and refreshing an access token is a
/// `ClientMiddleware` this module does not have yet, so every call from here
/// reaches only the BFM's unauthenticated perimeter — `/health` and the pairing
/// handshake. Adding an authenticated call means adding that middleware first,
/// not adding a header at a call site.
public struct BFMHTTPClient: Sendable {
    private let generated: Client

    /// - Parameter baseURL: The BFM's origin. Paths from the contract are
    ///   appended to it, so a trailing path component here becomes a prefix on
    ///   every request.
    public init(baseURL: URL) {
        self.init(baseURL: baseURL, transport: URLSessionTransport())
    }

    /// The seam every test uses, and the reason none of them stub `URLProtocol`.
    /// `internal` because a caller choosing its own transport is choosing its
    /// own timeouts, redirect policy and TLS behaviour — decisions that belong
    /// to this module, not to a screen.
    internal init(baseURL: URL, transport: any ClientTransport) {
        generated = Client(serverURL: baseURL, transport: transport)
    }

    /// Asks the BFM whether it is alive.
    ///
    /// Answers without a database round-trip on the far side, so a timeout here
    /// means the network or the process, never a slow query.
    public func health() async throws -> BFMHealth {
        let output = try await generated.health()
        switch output {
        case .ok(let ok):
            let payload = try ok.body.json
            return BFMHealth(
                pillar: payload.pillar.rawValue,
                version: payload.version,
                reportedAt: payload.ts
            )
        case .undocumented(let statusCode, _):
            throw BFMClientError.undocumentedResponse(
                operation: Operations.Health.id,
                statusCode: statusCode
            )
        }
    }
}
