import Foundation
import HTTPTypes
import OpenAPIRuntime

/// Attaches the device's access token, and reacts to the two ways the BFM can
/// refuse it.
///
/// A middleware rather than a transport, because the difference is which
/// decisions are being taken over. This needs to read and rewrite a request and
/// to send it more than once; it has no business choosing timeouts, redirect
/// policy or TLS behaviour, and a middleware structurally cannot. `BFMClient`
/// keeps those.
///
/// ## The status codes are the contract
///
/// The BFM separates them deliberately and this is the only place in the app
/// that acts on the distinction:
///
/// - **`401`** — this access token is not usable. It may simply have expired.
///   Refresh once, retry the request once. **A second `401` is not retried**:
///   the token it carried was minted seconds earlier by a refresh the server
///   itself performed, so a fresh rejection means something is wrong that
///   trying again cannot fix. It is returned to the caller as the `401` it is.
///   That is the whole of the loop protection, and it is structural — there is
///   no counter to get wrong, because there is no loop.
/// - **`403`** — this *device* is not usable. An operator revoked it, and no
///   token will ever work again. Refreshing would burn a round trip to be told
///   the same thing; the credentials are destroyed and the session ends.
///
/// ## What it will not touch
///
/// Only `/mobile/*` carries a bearer token, and this attaches one to nothing
/// else. That is an allowlist rather than a denylist, and the reason is
/// `POST /devices/refresh`: it answers `401` and `403` like any other route,
/// and a middleware that treated those as "refresh and retry" would attempt a
/// refresh from inside a refresh. Structuring the rule this way means that
/// cannot happen even if this instance is handed to a client that also performs
/// the refresh — the property does not depend on the composition root getting
/// its wiring right.
///
/// ## What a caller sees
///
/// A refresh that fails throws its ``SessionRefreshError`` rather than being
/// swallowed into the `401` that provoked it, because the two are different
/// facts: one request failed, versus this session has ended. The generated
/// client wraps anything a middleware throws in an `OpenAPIRuntime`
/// `ClientError`, so it arrives at a repository as that error's
/// `underlyingError` — and by then the session has *already* moved, so a caller
/// that only knows how to report "request failed" still cannot leave the app
/// showing a signed-in shell for a device that is no longer paired.
///
/// ## Credentials in logs
///
/// The header this adds never reaches an error value. `UniversalClient` builds
/// its `ClientError` from the request the *serializer* produced — the one
/// without an `Authorization` header — so a transport failure on the retried
/// request renders no token. That is a property of the runtime rather than of
/// this file, so it is asserted by a test rather than assumed.
public struct AuthenticatingMiddleware: ClientMiddleware {
    /// Every request path this middleware authenticates. The BFM's device
    /// surface — pairing, challenge, refresh — and `/health` are unauthenticated
    /// by definition and are deliberately absent.
    ///
    /// Matched against the *contract* path rather than the resolved URL, which
    /// is what the request carries at this point: a base URL with a path
    /// component of its own — the shell reaches this BFM at `/bfm-api/` — is
    /// prepended by the transport afterwards, so a prefix check on the final
    /// URL would be the thing that broke behind a proxy.
    private static let authenticatedPathPrefix = "/mobile/"

    private let refresher: DeviceSessionRefresher

    public init(refresher: DeviceSessionRefresher) {
        self.refresher = refresher
    }

    public func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        guard Self.carriesCredentials(request) else {
            return try await next(request, body, baseURL)
        }

        let attempt = AuthenticatedAttempt(
            request: request,
            body: try await ReplayableBody(capturing: body),
            baseURL: baseURL
        )
        guard let tokens = await refresher.currentTokens() else {
            // Unpaired, or wiped by a `403` that landed while this request was
            // being prepared. Sent without a token so the BFM answers the
            // refusal, rather than short-circuited here into an error only this
            // app knows how to produce.
            return try await attempt.send(authorizedWith: nil, through: next)
        }

        return try await reacting(
            to: try await attempt.send(authorizedWith: tokens.accessToken, through: next),
            of: attempt,
            rejecting: tokens.accessToken,
            through: next
        )
    }
}

extension AuthenticatingMiddleware {
    /// - Returns: The response to hand back — the first one unless a refresh
    ///   made a second attempt worth making.
    private func reacting(
        to answered: (HTTPResponse, HTTPBody?),
        of attempt: AuthenticatedAttempt,
        rejecting staleAccessToken: String,
        through next: (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        switch answered.0.status.code {
        case 401:
            guard attempt.isReplayable else { return answered }
            let refreshed = try await refresher.refreshedTokens(
                replacing: staleAccessToken,
                at: attempt.baseURL
            )
            let retried = try await attempt.send(
                authorizedWith: refreshed.accessToken,
                through: next
            )
            // The retry can meet a revocation that landed between the two
            // attempts. Handled here rather than by recursing, so the number of
            // requests this middleware can make stays two.
            if retried.0.status.code == 403 { await refresher.deviceWasRevoked() }
            return retried
        case 403:
            await refresher.deviceWasRevoked()
            return answered
        default:
            return answered
        }
    }

    private static func carriesCredentials(_ request: HTTPRequest) -> Bool {
        request.path?.hasPrefix(authenticatedPathPrefix) ?? false
    }
}
