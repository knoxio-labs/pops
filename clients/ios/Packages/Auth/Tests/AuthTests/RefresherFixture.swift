import AppCore
import Auth
import AuthTestSupport
import Foundation

/// A refresher wired to fakes, plus handles on each of them.
///
/// Shared by the two ``DeviceSessionRefresher`` suites and by the two
/// ``AuthenticatingMiddleware`` ones, because the assertions that matter are
/// about what is left on the device afterwards — and that means every suite
/// needs the key store and the token store, not just the refresher.
internal struct RefresherFixture {
    internal static let refreshedAt = Date(timeIntervalSince1970: 1_700_000_000)
    internal static let baseURL = URL(string: "https://bfm.example")!

    internal let refresher: DeviceSessionRefresher
    internal let exchange: ScriptedRefreshExchange
    internal let session: RecordingSessionEvents
    internal let keyStore: any DeviceKeyStore
    internal let tokenStore: any TokenStore

    internal init(
        exchange: ScriptedRefreshExchange = ScriptedRefreshExchange(),
        tokens: DeviceTokens? = .stub(),
        tokenStore: (any TokenStore)? = nil,
        withKey: Bool = true
    ) throws {
        let keyStore = InMemoryKeyStore()
        if withKey { try keyStore.createKey() }
        let tokenStore = tokenStore ?? InMemoryTokenStore(initial: tokens)
        let session = RecordingSessionEvents()

        self.refresher = DeviceSessionRefresher(
            credentialStore: DeviceCredentialStore(keyStore: keyStore, tokenStore: tokenStore),
            exchange: { _ in exchange },
            sessionEvents: session,
            now: { Self.refreshedAt }
        )
        self.exchange = exchange
        self.session = session
        self.keyStore = keyStore
        self.tokenStore = tokenStore
    }

    internal func refreshedTokens(replacing staleAccessToken: String) async throws -> DeviceTokens {
        try await refresher.refreshedTokens(replacing: staleAccessToken, at: Self.baseURL)
    }
}
