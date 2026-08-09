import Foundation
import HTTPTypes
import OpenAPIRuntime

/// One outbound request, and everything needed to send it a second time.
///
/// A retry is not "call `next` again with the same arguments". It is the same
/// request carrying a *different* credential, with a body that has to be
/// produced afresh because the first attempt consumed it. Both are easy to get
/// subtly wrong at a call site — retrying with the token that was just rejected
/// still makes two requests, and reusing a spent body still sends one — so
/// neither is a call site's decision here.
///
/// `next` is a parameter of ``send(authorizedWith:through:)`` rather than a
/// stored property, because `ClientMiddleware` hands it over non-escaping and a
/// conformance cannot widen that. Storing it would mean
/// `withoutActuallyEscaping`, which would be a promise about lifetime made in a
/// comment; taking it per call is the same promise made by the type system.
internal struct AuthenticatedAttempt {
    private let request: HTTPRequest
    private let body: ReplayableBody

    /// The origin this request went to, carried so the refresh that follows a
    /// `401` cannot be sent anywhere else.
    internal let baseURL: URL

    internal init(request: HTTPRequest, body: ReplayableBody, baseURL: URL) {
        self.request = request
        self.body = body
        self.baseURL = baseURL
    }

    /// Whether a second attempt can carry the same bytes as the first.
    internal var isReplayable: Bool { body.isReplayable }

    /// - Parameter accessToken: `nil` sends the request unauthenticated, which
    ///   is what an unpaired device does — the BFM's refusal is a better answer
    ///   than one this app invented without asking.
    ///
    /// Assigned rather than conditionally inserted, so `nil` *removes* any
    /// `Authorization` the request arrived with instead of merely declining to
    /// add one. Nothing sets that header today — the contract declares no
    /// security scheme, so the generated client never does — but middlewares
    /// compose, and "unauthenticated" being true only because no one else
    /// happened to write the header is a promise that holds by luck.
    internal func send(
        authorizedWith accessToken: String?,
        through next: (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        var outgoing = request
        outgoing.headerFields[.authorization] = accessToken.map { "Bearer \($0)" }
        return try await next(outgoing, body.body(), baseURL)
    }
}
