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
/// - **`403 bfm.auth.device_revoked`** — an operator revoked this device. The
///   credentials are destroyed and the session ends.
/// - **`403 capability_not_granted`** — the device remains paired but cannot
///   use this route. The response is returned without changing the session.
///   Other or unreadable `403` bodies are also returned without destroying
///   credentials; only the explicit revocation code ends the session.
///
/// ## What it will not touch
///
/// Only `/mobile/*` carries a bearer token. Everything else is sent with the
/// `Authorization` header **removed** — not merely without one added, which is
/// a weaker promise that holds only while nothing upstream writes the header.
///
/// That is an allowlist rather than a denylist, and the reason is
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
    private static let maximumRefusalBodyBytes = 1_048_576

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
            // Stripped rather than forwarded untouched, so the allowlist is a
            // rule about what leaves this app and not merely about what this
            // type adds. It matters most on precisely these paths: the BFM's
            // device surface answers on the hostname where Cloudflare Access is
            // *bypassed*, so a bearer token sent there travels with less in
            // front of it than anywhere else — and no route under it has ever
            // needed one.
            return try await next(Self.unauthenticated(request), body, baseURL)
        }

        let attempt = AuthenticatedAttempt(
            request: request,
            body: try await ReplayableBody(capturing: body),
            baseURL: baseURL
        )
        guard let credentials = await refresher.currentCredentialSnapshot(),
            let tokens = credentials.tokens
        else {
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
            credentialRevision: credentials.revision,
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
        credentialRevision: UInt64,
        through next: (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        switch answered.0.status.code {
        case 401:
            guard attempt.isReplayable else { return answered }
            let refreshed = try await refresher.refreshedCredentials(
                replacing: staleAccessToken,
                at: attempt.baseURL
            )
            guard let refreshedTokens = refreshed.tokens else {
                throw SessionRefreshError.unauthenticated
            }
            let retried = try await attempt.send(
                authorizedWith: refreshedTokens.accessToken,
                through: next
            )
            // The retry can meet a revocation that landed between the two
            // attempts. Handled here rather than by recursing, so the number of
            // requests this middleware can make stays two.
            return await preservingSessionUnlessRevoked(
                retried,
                ifRevision: refreshed.revision
            )
        case 403:
            return await preservingSessionUnlessRevoked(
                answered,
                ifRevision: credentialRevision
            )
        default:
            return answered
        }
    }

    private func preservingSessionUnlessRevoked(
        _ answered: (HTTPResponse, HTTPBody?),
        ifRevision revision: UInt64
    ) async -> (HTTPResponse, HTTPBody?) {
        guard answered.0.status.code == 403, let body = answered.1 else { return answered }
        if case .known(let length) = body.length,
            length > Int64(Self.maximumRefusalBodyBytes)
        {
            return answered
        }

        if body.iterationBehavior == .multiple {
            do {
                let bytes = try await [UInt8](collecting: body, upTo: Self.maximumRefusalBodyBytes)
                if Self.isDeviceRevocation(bytes) {
                    _ = await refresher.deviceWasRevoked(ifRevision: revision)
                }
            } catch {
                return answered
            }
            return answered
        }

        return await preservingSinglePassRefusalBody(
            body,
            in: answered.0,
            ifRevision: revision
        )
    }

    private func preservingSinglePassRefusalBody(
        _ body: HTTPBody,
        in response: HTTPResponse,
        ifRevision revision: UInt64
    ) async -> (HTTPResponse, HTTPBody?) {
        var iterator = body.makeAsyncIterator()
        var bytes: [UInt8] = []
        do {
            while let chunk = try await iterator.next() {
                guard chunk.count <= Self.maximumRefusalBodyBytes - bytes.count else {
                    let source = RefusalBodyReplaySource(
                        state: RefusalBodyReplayState(
                            prefix: [ArraySlice(bytes), chunk], iterator: iterator))
                    return (
                        response,
                        HTTPBody(
                            RefusalBodyReplaySequence(source: source),
                            length: .unknown,
                            iterationBehavior: .single
                        )
                    )
                }
                bytes.append(contentsOf: chunk)
            }
            if Self.isDeviceRevocation(bytes) {
                _ = await refresher.deviceWasRevoked(ifRevision: revision)
            }
            return (response, HTTPBody(bytes))
        } catch {
            let source = RefusalBodyReplaySource(
                state: RefusalBodyReplayState(
                    prefix: [ArraySlice(bytes)], terminalError: error))
            return (
                response,
                HTTPBody(
                    RefusalBodyReplaySequence(source: source),
                    length: .unknown,
                    iterationBehavior: .single
                )
            )
        }
    }

    private static func isDeviceRevocation(_ bytes: [UInt8]) -> Bool {
        guard let refusal = try? JSONDecoder().decode(BFMRefusalBody.self, from: Data(bytes)) else {
            return false
        }
        return refusal.code == "bfm.auth.device_revoked"
    }

    private static func carriesCredentials(_ request: HTTPRequest) -> Bool {
        request.path?.hasPrefix(authenticatedPathPrefix) ?? false
    }

    private static func unauthenticated(_ request: HTTPRequest) -> HTTPRequest {
        var stripped = request
        stripped.headerFields[.authorization] = nil
        return stripped
    }
}

private struct BFMRefusalBody: Decodable {
    let code: String
}

private struct RefusalBodyReplayState {
    fileprivate var prefix: [HTTPBody.ByteChunk]
    fileprivate var iterator: HTTPBody.Iterator?
    fileprivate var terminalError: (any Error)?

    fileprivate init(
        prefix: [HTTPBody.ByteChunk],
        iterator: HTTPBody.Iterator? = nil,
        terminalError: (any Error)? = nil
    ) {
        self.prefix = prefix.filter { !$0.isEmpty }
        self.iterator = iterator
        self.terminalError = terminalError
    }
}

private final class RefusalBodyReplaySource: @unchecked Sendable {
    private let lock = NSLock()
    private var state: RefusalBodyReplayState?

    fileprivate init(state: RefusalBodyReplayState) {
        self.state = state
    }

    fileprivate func takeState() -> RefusalBodyReplayState? {
        // The lock makes the non-Sendable iterator a one-time handoff to its consumer.
        lock.lock()
        defer { lock.unlock() }
        let state = self.state
        self.state = nil
        return state
    }
}

private struct RefusalBodyReplaySequence: AsyncSequence, Sendable {
    internal typealias Element = HTTPBody.ByteChunk

    internal struct AsyncIterator: AsyncIteratorProtocol {
        private var prefix: [HTTPBody.ByteChunk]
        private var iterator: HTTPBody.Iterator?
        private var terminalError: (any Error)?
        private var terminalErrorDelivered = false
        private var alreadyConsumed = false

        fileprivate init(state: RefusalBodyReplayState?) {
            if let state {
                self.prefix = state.prefix
                self.iterator = state.iterator
                self.terminalError = state.terminalError
                self.alreadyConsumed = false
            } else {
                self.prefix = []
                self.iterator = nil
                self.terminalError = nil
                self.alreadyConsumed = true
            }
        }

        internal mutating func next() async throws -> Element? {
            if !prefix.isEmpty { return prefix.removeFirst() }
            if let terminalError {
                guard !terminalErrorDelivered else { return nil }
                terminalErrorDelivered = true
                throw terminalError
            }
            guard var iterator else {
                if alreadyConsumed { throw RefusalBodyReplayAlreadyConsumedError() }
                return nil
            }
            let chunk = try await iterator.next()
            if chunk == nil {
                self.iterator = nil
            } else {
                self.iterator = iterator
            }
            return chunk
        }
    }

    private let source: RefusalBodyReplaySource

    fileprivate init(source: RefusalBodyReplaySource) {
        self.source = source
    }

    internal func makeAsyncIterator() -> AsyncIterator {
        AsyncIterator(state: source.takeState())
    }
}

private struct RefusalBodyReplayAlreadyConsumedError: Error {}
