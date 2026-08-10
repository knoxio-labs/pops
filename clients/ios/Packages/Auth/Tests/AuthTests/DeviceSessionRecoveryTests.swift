import AppCore
import BFMClient
import Foundation
import Testing

@testable import Auth

/// Every way a rotation can fail, and what each one leaves on the device.
///
/// The assertions are about state rather than about calls, because that is what
/// the next launch reads: whether a credential is still there, and what the
/// session now says about it. The dividing line running through all of them is
/// whether the failure was a statement about *this device's* credentials or
/// about the network in between — and only the first kind is allowed to destroy
/// anything.
@Suite("DeviceSessionRefresher recovery")
internal struct DeviceSessionRecoveryTests {
    @Test("an invalid grant ends the session and leaves nothing to retry with")
    func invalidGrantRevokesTheSession() async throws {
        let fixture = try RefresherFixture(
            exchange: ScriptedRefreshExchange(
                refreshes: [.failure(BFMClientError.refreshRefused(.invalidGrant))]
            )
        )

        await #expect(throws: SessionRefreshError.credentialsRejected) {
            try await fixture.refreshedTokens(replacing: "access-1")
        }

        #expect(fixture.session.events == [.revoked(.credentialsRejected)])
        #expect(fixture.exchange.spends.count == 1, "a refused grant must not be re-presented")
        // Not wiped. The credentials are dead on the server, but pairing again
        // is what replaces them and pairing wipes first — destroying them here
        // would only add a way for a misread `401` to cost a device its
        // identity with nothing gained.
        #expect(try fixture.tokenStore.load() != nil)
    }

    @Test("a revoked device is wiped and reported as the operator's doing")
    func deviceRevokedDestroysCredentials() async throws {
        let fixture = try RefresherFixture(
            exchange: ScriptedRefreshExchange(
                refreshes: [.failure(BFMClientError.refreshRefused(.deviceRevoked))]
            )
        )

        await #expect(throws: SessionRefreshError.deviceRevoked) {
            try await fixture.refreshedTokens(replacing: "access-1")
        }

        #expect(fixture.session.events == [.revoked(.revokedByOperator)])
        #expect(try fixture.tokenStore.load() == nil)
        #expect(try fixture.keyStore.publicKey() == nil)
    }

    @Test("an unreachable BFM changes nothing")
    func transportFailureLeavesTheSessionAlone() async throws {
        let fixture = try RefresherFixture(
            exchange: ScriptedRefreshExchange(
                challenges: [
                    .failure(
                        BFMClientError.transportFailure(
                            operation: "device.challenge",
                            summary: "offline"
                        )
                    )
                ]
            )
        )

        await #expect(throws: SessionRefreshError.self) {
            try await fixture.refreshedTokens(replacing: "access-1")
        }

        #expect(fixture.session.events.isEmpty)
        #expect(try fixture.tokenStore.load() == .stub())
        #expect(try fixture.keyStore.publicKey() != nil)
    }

    @Test("an expired nonce is retried exactly once, then given up on")
    func challengeExpiredRetriesOnce() async throws {
        let fixture = try RefresherFixture(
            exchange: ScriptedRefreshExchange(
                refreshes: [.failure(BFMClientError.refreshRefused(.challengeExpired))]
            )
        )

        await #expect(throws: SessionRefreshError.self) {
            try await fixture.refreshedTokens(replacing: "access-1")
        }

        #expect(fixture.exchange.challengeCount == 2)
        #expect(fixture.exchange.spends.count == 2)
        // A nonce store that is not keeping its nonces is a server fault, not a
        // credential to destroy.
        #expect(fixture.session.events.isEmpty)
        #expect(try fixture.tokenStore.load() != nil)
    }

    @Test("a second challenge that succeeds completes the rotation")
    func challengeExpiredRecovers() async throws {
        let fixture = try RefresherFixture(
            exchange: ScriptedRefreshExchange(
                challenges: [.success(.stub(nonce: "stale")), .success(.stub(nonce: "fresh"))],
                refreshes: [
                    .failure(BFMClientError.refreshRefused(.challengeExpired)), .success(.stub()),
                ]
            )
        )

        let tokens = try await fixture.refreshedTokens(replacing: "access-1")

        #expect(tokens.accessToken == "access-2")
        #expect(fixture.exchange.spends.map(\.nonce) == ["stale", "fresh"])
    }

    @Test("nothing stored is not something to retry")
    func unauthenticatedWithoutTokens() async throws {
        let fixture = try RefresherFixture(tokens: nil)

        await #expect(throws: SessionRefreshError.unauthenticated) {
            try await fixture.refreshedTokens(replacing: "access-1")
        }

        #expect(fixture.session.events == [.revoked(.credentialsRejected)])
        #expect(fixture.exchange.challengeCount == 0)
    }

    /// The case that would sign people out for locking their phone.
    ///
    /// A refresh is a background operation — that is why the signing key
    /// carries no biometry — so it routinely runs while the handset is locked,
    /// and the data-protection keychain answers a read then with an error
    /// rather than with a value. Reading that as "unpaired" ends the session
    /// over credentials that are intact and readable a second after unlock.
    @Test("an unreadable keychain is not an unpaired device")
    func lockedKeychainIsTransient() async throws {
        let fixture = try RefresherFixture(
            tokenStore: UnreadableTokenStore(failing: .keychain(errSecInteractionNotAllowed))
        )

        await #expect(throws: SessionRefreshError.self) {
            try await fixture.refreshedTokens(replacing: "access-1")
        }

        #expect(fixture.session.events.isEmpty, "a locked device was signed out")
        #expect(fixture.exchange.challengeCount == 0)
    }

    /// The read failure that is genuinely not transient: the blob is there and
    /// will never decode, which `TokenStoreError` says to treat as unpaired.
    @Test("a corrupted payload is an unpaired device")
    func corruptedPayloadEndsTheSession() async throws {
        let fixture = try RefresherFixture(
            tokenStore: UnreadableTokenStore(failing: .corruptedPayload)
        )

        await #expect(throws: SessionRefreshError.unauthenticated) {
            try await fixture.refreshedTokens(replacing: "access-1")
        }

        #expect(fixture.session.events == [.revoked(.credentialsRejected)])
    }

    /// A device that has lost its Enclave key can never prove possession again,
    /// whatever its token says. Every *other* key-store failure — a device
    /// locked mid-refresh, most of all — is transient and must not land here.
    @Test("a missing device key ends the session rather than retrying forever")
    func missingKeyEndsTheSession() async throws {
        let fixture = try RefresherFixture(withKey: false)

        await #expect(throws: SessionRefreshError.credentialsRejected) {
            try await fixture.refreshedTokens(replacing: "access-1")
        }

        #expect(fixture.session.events == [.revoked(.credentialsRejected)])
        #expect(fixture.exchange.spends.isEmpty)
    }

    /// A rotation and a revocation racing, with the rotation finishing second.
    ///
    /// The order is the whole test: the refresh is held open, the device is
    /// revoked while it is in flight, and only then is the refresh allowed to
    /// return a perfectly valid new token pair. Writing that pair would put a
    /// live-looking credential back on a handset that was deliberately wiped,
    /// and leave a token pair with no Enclave key behind it — the half-state
    /// `DeviceCredentialStore.wipe()` exists to make impossible.
    ///
    /// Reachable in production without either side being slow: request A's
    /// refresh is accepted just before the revocation reaches the row, request
    /// B's `/mobile` call meets the guard just after.
    @Test("a revocation during a rotation is not undone by the rotation's write")
    func revocationDuringRotationWins() async throws {
        let gate = Gate()
        let fixture = try RefresherFixture(
            exchange: ScriptedRefreshExchange(beforeRefresh: { await gate.wait() })
        )

        let rotation = Task { try await fixture.refreshedTokens(replacing: "access-1") }

        // Parked *at the gate*, not merely past the challenge. Between the two
        // the rotation signs the nonce with the Enclave key, and the revocation
        // below deletes that key — so synchronising on the challenge count
        // raced the signature and produced `credentialsRejected` from a lost
        // key rather than the `deviceRevoked` this test is about, on roughly
        // one run in five.
        let parked = await waitUntil("the rotation to park inside the exchange") {
            await gate.hasParked
        }
        await fixture.refresher.deviceWasRevoked()
        await gate.open()
        #expect(parked, "the rotation never reached the exchange")

        await #expect(throws: SessionRefreshError.deviceRevoked) { try await rotation.value }

        #expect(try fixture.tokenStore.load() == nil, "a wiped device got its tokens back")
        #expect(try fixture.keyStore.publicKey() == nil)
        // The exchange really did hand back a usable pair — this test would pass
        // vacuously against a refresh that had simply failed.
        #expect(fixture.exchange.spends.count == 1)
    }

    @Test("twenty concurrent revocations wipe once and report once")
    func concurrentRevocationsCollapse() async throws {
        let fixture = try RefresherFixture()

        await withTaskGroup(of: Void.self) { group in
            for _ in 0..<20 { group.addTask { await fixture.refresher.deviceWasRevoked() } }
        }

        #expect(fixture.session.events == [.revoked(.revokedByOperator)])
        #expect(try fixture.tokenStore.load() == nil)
    }

    @Test("no error rendered by a refresh carries a credential")
    func errorsAreRedacted() async throws {
        let fixture = try RefresherFixture(
            exchange: ScriptedRefreshExchange(
                refreshes: [.failure(BFMClientError.refreshRefused(.invalidGrant))]
            )
        )

        var rendered = ""
        do {
            _ = try await fixture.refreshedTokens(replacing: "access-1")
        } catch {
            rendered = "\(error) \(String(describing: error))"
        }

        #expect(!rendered.isEmpty)
        for secret in ["access-1", "refresh-1", "access-2", "refresh-2"] {
            #expect(!rendered.contains(secret), "\(secret) reached a rendered error")
        }
    }
}
