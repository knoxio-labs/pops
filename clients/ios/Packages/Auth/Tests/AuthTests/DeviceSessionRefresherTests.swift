import AuthTestSupport
import Foundation
import Testing

@testable import Auth

/// One rotation, and the three ways a caller can arrive at one.
///
/// The failure paths are a separate suite — see
/// ``DeviceSessionRecoveryTests`` — because they are asking a different
/// question: not "was one rotation performed" but "what is left on this device
/// afterwards".
@Suite("DeviceSessionRefresher")
internal struct DeviceSessionRefresherTests {
    @Test("a rotation signs the stored grant and persists the successor")
    func happyPath() async throws {
        let fixture = try RefresherFixture()

        let tokens = try await fixture.refreshedTokens(replacing: "access-1")

        #expect(tokens.accessToken == "access-2")
        #expect(tokens.refreshToken == "refresh-2")
        #expect(
            tokens.accessTokenExpiresAt == RefresherFixture.refreshedAt.addingTimeInterval(900)
        )
        #expect(try fixture.tokenStore.load() == tokens)
        #expect(fixture.session.events.isEmpty)
    }

    @Test("the signature covers the message the BFM will rebuild")
    func signsTheContractedMessage() async throws {
        let fixture = try RefresherFixture()

        _ = try await fixture.refreshedTokens(replacing: "access-1")

        let spend = try #require(fixture.exchange.spends.first)
        #expect(spend.refreshToken == "refresh-1")
        #expect(spend.nonce == "nonce-1")

        let publicKey = try #require(try fixture.keyStore.publicKey())
        let signature = try #require(Data(base64Encoded: spend.signatureBase64))
        #expect(
            publicKey.isValidSignature(
                signature,
                for: RefreshSignatureMessage.bytes(nonce: "nonce-1", refreshToken: "refresh-1")
            )
        )
    }

    /// The assertion the ticket is really about, and the one it is easy to make
    /// vacuous.
    ///
    /// A gate holds the single rotation open until the store has been read
    /// `callers + 1` times — once by each caller on its way in, once by the
    /// rotation itself. Only then is the rotation allowed to finish. So this
    /// does not assert "one rotation happened"; it asserts "nineteen callers
    /// were parked *inside* the refresher while the twentieth's rotation was in
    /// flight, and none of them started a second one" — which is the state the
    /// BFM burns a token family for.
    @Test("twenty concurrent callers produce exactly one rotation")
    func concurrentCallersRotateOnce() async throws {
        let callers = 20
        let gate = Gate()
        let counted = CountingTokenStore(InMemoryTokenStore(initial: .stub()))
        let fixture = try RefresherFixture(
            exchange: ScriptedRefreshExchange(beforeRefresh: { await gate.wait() }),
            tokenStore: counted
        )

        try await withThrowingTaskGroup(of: DeviceTokens.self) { group in
            for _ in 0..<callers {
                group.addTask { try await fixture.refreshedTokens(replacing: "access-1") }
            }
            let allArrived = await waitUntil("every caller to reach the refresher") {
                counted.readCount >= callers + 1
            }
            await gate.open()
            #expect(allArrived, "a caller never reached the refresher")

            for try await tokens in group { #expect(tokens.accessToken == "access-2") }
        }

        #expect(fixture.exchange.spends.count == 1)
        #expect(fixture.exchange.challengeCount == 1)
    }

    /// The case that is easy to leave out: a caller slow enough to miss the
    /// in-flight window entirely. Its token is stale, but the store's is not,
    /// and rotating again would present a consumed token and burn the family —
    /// reached without any two calls ever being concurrent.
    @Test("a caller arriving after a rotation finished does not start another")
    func lateCallerReusesTheStoredPair() async throws {
        let fixture = try RefresherFixture()

        let first = try await fixture.refreshedTokens(replacing: "access-1")
        let second = try await fixture.refreshedTokens(replacing: "access-1")

        #expect(first == second)
        #expect(fixture.exchange.spends.count == 1)
    }

    /// And the converse: a token that really was rejected must still rotate,
    /// or a device whose fresh token is refused simply stops working.
    @Test("a genuinely rejected fresh token rotates again")
    func rejectedSuccessorRotatesOnceMore() async throws {
        let fixture = try RefresherFixture(
            exchange: ScriptedRefreshExchange(
                challenges: [.success(.stub(nonce: "nonce-1")), .success(.stub(nonce: "nonce-2"))],
                refreshes: [
                    .success(.stub(accessToken: "access-2", refreshToken: "refresh-2")),
                    .success(.stub(accessToken: "access-3", refreshToken: "refresh-3")),
                ]
            )
        )

        _ = try await fixture.refreshedTokens(replacing: "access-1")
        let second = try await fixture.refreshedTokens(replacing: "access-2")

        #expect(second.accessToken == "access-3")
        #expect(fixture.exchange.spends.map(\.refreshToken) == ["refresh-1", "refresh-2"])
    }
}
