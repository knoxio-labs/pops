import Foundation
import HTTPTypes
import OpenAPIRuntime
import Synchronization

/// Stands in for everything below ``AuthenticatingMiddleware``: it records each
/// attempt and answers with a status chosen from the request.
///
/// Recording the `Authorization` header rather than only the count is what
/// makes "the retry carried the *new* token" assertable — a middleware that
/// retried with the stale one would still make two attempts, and a test that
/// counted them would not notice.
///
/// Collecting the body is deliberate too: it consumes the sequence, so a
/// middleware that handed the same single-pass body to both attempts would show
/// up here as an empty second body rather than passing quietly.
internal final class RecordingTransport: Sendable {
    internal struct Attempt: Sendable, Equatable {
        internal let authorization: String?
        internal let path: String?
        internal let body: [UInt8]?
    }

    private let recorded = Mutex<[Attempt]>([])
    private let respond: @Sendable (HTTPRequest) async -> HTTPResponse.Status

    internal init(respond: @escaping @Sendable (HTTPRequest) async -> HTTPResponse.Status) {
        self.respond = respond
    }

    internal var attempts: [Attempt] { recorded.withLock { $0 } }

    /// Answers `unauthorized` while the request carries `staleAccessToken` and
    /// `ok` once it carries anything else — the shape of an ordinary expiry.
    internal static func rejecting(
        _ staleAccessToken: String,
        onArrival: @escaping @Sendable () async -> Void = {}
    ) -> RecordingTransport {
        RecordingTransport { request in
            guard request.headerFields[.authorization] == "Bearer \(staleAccessToken)" else {
                return .ok
            }
            await onArrival()
            return .unauthorized
        }
    }

    /// The closure shape `ClientMiddleware.intercept` hands its `next`.
    internal var next:
        @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (
            HTTPResponse, HTTPBody?
        )
    {
        { [self] request, body, _ in
            var collected: [UInt8]?
            if let body { collected = try await [UInt8](collecting: body, upTo: 1 << 16) }
            recorded.withLock {
                $0.append(
                    Attempt(
                        authorization: request.headerFields[.authorization],
                        path: request.path,
                        body: collected
                    )
                )
            }
            return (HTTPResponse(status: await respond(request)), nil)
        }
    }
}
