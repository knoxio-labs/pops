import Auth
import Foundation
import HTTPTypes
import OpenAPIRuntime

/// The middleware, its refresher and every fake behind them.
///
/// Wraps ``RefresherFixture`` rather than rebuilding one, so a change to how a
/// refresher is composed reaches both pairs of suites at once.
internal struct MiddlewareFixture {
    internal let middleware: AuthenticatingMiddleware
    internal let refresher: RefresherFixture

    internal init(
        exchange: ScriptedRefreshExchange = ScriptedRefreshExchange(),
        tokens: DeviceTokens? = .stub(),
        tokenStore: (any TokenStore)? = nil
    ) throws {
        refresher = try RefresherFixture(
            exchange: exchange,
            tokens: tokens,
            tokenStore: tokenStore
        )
        middleware = AuthenticatingMiddleware(refresher: refresher.refresher)
    }

    internal var exchange: ScriptedRefreshExchange { refresher.exchange }
    internal var session: RecordingSessionEvents { refresher.session }
    internal var keyStore: any DeviceKeyStore { refresher.keyStore }
    internal var tokenStore: any TokenStore { refresher.tokenStore }

    /// - Returns: The response the middleware settled on. The body is dropped:
    ///   every assertion in these suites is about the status and about what the
    ///   transport was asked, and no fake here produces a response body.
    internal func send(
        _ request: HTTPRequest = .mobile(),
        body: HTTPBody? = nil,
        through transport: RecordingTransport
    ) async throws -> HTTPResponse {
        try await middleware.intercept(
            request,
            body: body,
            baseURL: RefresherFixture.baseURL,
            operationID: "mobile.bootstrap",
            next: transport.next
        )
        .0
    }
}
