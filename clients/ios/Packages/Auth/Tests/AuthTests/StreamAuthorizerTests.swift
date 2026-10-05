import BFMClient
import Testing

@testable import Auth

@Suite("Device session stream authorizer")
internal struct StreamAuthorizerTests {
    @Test("current access token returns the stored token or nil")
    func currentAccessToken() async throws {
        let paired = try RefresherFixture()
        let unpaired = try RefresherFixture(tokens: nil)

        #expect(await paired.refresher.currentAccessToken() == "access-1")
        #expect(await unpaired.refresher.currentAccessToken() == nil)
    }

    @Test("refresh returns and stores the rotated access token")
    func refreshedAccessTokenStoresRotation() async throws {
        let fixture = try RefresherFixture()

        let accessToken = try await fixture.refresher.refreshedAccessToken(
            replacing: "access-1",
            at: RefresherFixture.baseURL
        )

        #expect(accessToken == "access-2")
        #expect(try fixture.tokenStore.load()?.accessToken == "access-2")
        #expect(fixture.exchange.spends.count == 1)
    }

    @Test("a late stale request uses the stored token without a second exchange")
    func lateStaleRequestDoesNotRefreshAgain() async throws {
        let fixture = try RefresherFixture()

        _ = try await fixture.refresher.refreshedAccessToken(
            replacing: "access-1",
            at: RefresherFixture.baseURL
        )
        let lateAccessToken = try await fixture.refresher.refreshedAccessToken(
            replacing: "access-1",
            at: RefresherFixture.baseURL
        )

        #expect(lateAccessToken == "access-2")
        #expect(fixture.exchange.spends.count == 1)
    }

    @Test("a refused refresh throws without returning a token")
    func refusedRefreshThrows() async throws {
        let fixture = try RefresherFixture(
            exchange: ScriptedRefreshExchange(
                refreshes: [.failure(BFMClientError.refreshRefused(.invalidGrant))]
            )
        )

        await #expect(throws: SessionRefreshError.credentialsRejected) {
            try await fixture.refresher.refreshedAccessToken(
                replacing: "access-1",
                at: RefresherFixture.baseURL
            )
        }
        #expect(fixture.exchange.spends.count == 1)
    }
}
