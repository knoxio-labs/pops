import AppCore
import BFMClient
import Foundation

/// Rotates the device's tokens, at most once at a time, and decides what a
/// failure to do so means for the session.
///
/// ## Why an actor, and why single-flight is not an optimisation
///
/// The BFM rotates refresh tokens and revokes the entire token family when a
/// consumed one is presented again — deliberately, because two parties holding
/// what should be one credential is a theft or a replay and there is no third
/// reading. It does not distinguish an honest handset that submitted twice from
/// a thief racing it, and it must not: the sequential version of that same
/// event already burns the family.
///
/// So two concurrent refreshes do not waste a round trip. **They sign the user
/// out and force a re-pairing**, and they do it on the exact occasion the app
/// is under load — a screen that fires four requests on appear, all of them
/// holding the same expired token. That is why this is an actor and not a lock
/// around async work: a lock held across an `await` either deadlocks or is not
/// held, and the version that is not held is the one that ships, because it
/// passes every test written before this comment.
///
/// ## The three ways a caller can arrive
///
/// 1. **First in.** No refresh is running and the stored token is still the one
///    that was rejected. It starts one.
/// 2. **Alongside.** A refresh is running. It awaits that one's result and
///    makes no call of its own.
/// 3. **Late.** A refresh already finished. The stored token is no longer the
///    rejected one, so it takes what is stored and does not refresh at all.
///
/// Case 3 is the one that is easy to leave out, and leaving it out is how a
/// slow request that was queued behind twenty others triggers a second refresh
/// a moment after the first succeeded — the family-burning case, reached
/// without any two calls ever being concurrent.
public actor DeviceSessionRefresher {
    let credentialStore: DeviceCredentialStore
    let exchange: @Sendable (URL) -> any DeviceRefreshExchange
    let sessionEvents: any SessionEventSink
    let now: @Sendable () -> Date

    var rotation: Task<CredentialTokenSnapshot, any Error>?
    var revocation: RevocationFlight?
    #if DEBUG
        var revocationJoinObserver: @Sendable () -> Void = {}
        var revocationPrecheckObserver: @Sendable () async -> Void = {}
    #endif

    /// Bumped every time credentials are destroyed. A rotation that started
    /// before the bump must not write what it obtained — see ``rotateTokens(replacing:at:)``.
    var credentialEpoch = 0

    /// Revision for which the session was already told the credentials are dead.
    ///
    /// A screen's worth of requests all read the same corrupt keychain or meet
    /// the same refused grant, and every one of them reaches the same verdict.
    /// The session reducer collapses the repeats anyway — this keeps twenty
    /// requests from each hopping to the main actor to say it. Cleared whenever
    /// the stored pair is replaced or destroyed, so a *later* rejection is
    /// reported again rather than swallowed by a latch that never resets.
    var reportedCredentialsRejectedRevision: UInt64?

    /// - Parameters:
    ///   - credentialStore: The tokens to rotate and the key that proves this
    ///     device may.
    ///   - exchange: Built per base URL rather than held, for the same reason
    ///     pairing builds its own: a device learns where its BFM is by pairing,
    ///     so there is no client to construct before then. It must reach the
    ///     BFM **unauthenticated** — see ``DeviceRefreshExchange``.
    ///   - sessionEvents: Where a session that has ended is reported. Normally
    ///     the app's `SessionStore`.
    ///   - now: Read once per rotation, to turn the server's `expiresIn`
    ///     duration into a deadline.
    public init(
        credentialStore: DeviceCredentialStore,
        exchange: @escaping @Sendable (URL) -> any DeviceRefreshExchange = {
            BFMHTTPClient(baseURL: $0)
        },
        sessionEvents: any SessionEventSink,
        now: @escaping @Sendable () -> Date = Date.init
    ) {
        self.credentialStore = credentialStore
        self.exchange = exchange
        self.sessionEvents = sessionEvents
        self.now = now
    }

    /// The stored pair, or `nil` when this device is unpaired, wiped, or
    /// holding a blob it can no longer decode.
    ///
    /// A read failure is reported as `nil` rather than thrown. The caller is a
    /// middleware about to send a request, and its two options are "attach a
    /// token" and "do not"; a keychain that cannot be read leaves it with the
    /// second either way.
    ///
    /// `corruptedPayload` is the one that cannot just return `nil` and stop
    /// there. It is permanent — a downgrade, a truncated write — so the
    /// middleware would send every `/mobile` request unauthenticated, take the
    /// unpaired branch that never reaches a refresh, and collect a `401` each
    /// time while the session still says `paired`. The app would show a
    /// signed-in shell over credentials that can never work again, with nothing
    /// telling anyone to pair. So it ends the session here, which is the same
    /// answer the refresh snapshot gives it on the refresh path — the two must not
    /// disagree about what an undecodable blob means.
    ///
    /// Not wiped, for the reason the invalid-grant path is not: replacement
    /// pairing leaves these credentials active until the BFM accepts the new
    /// code, so destroying them here only adds a way for a misread to cost a
    /// device its identity.
    ///
    /// Every other read failure returns `nil` and says nothing. A locked
    /// handset is normal for background work — the refresh path keeps that
    /// transient failure separate from a corrupt token payload.
    public func currentTokens() async -> DeviceTokens? {
        await currentCredentialSnapshot()?.tokens
    }

    internal func currentCredentialSnapshot() async -> CredentialTokenSnapshot? {
        do {
            return try credentialStore.tokenSnapshot()
        } catch CredentialSnapshotError.corruptedPayload(let revision) {
            await reportCredentialsRejected(ifRevision: revision)
            return nil
        } catch {
            return nil
        }
    }

    /// Produces a token pair newer than the one that was just rejected.
    ///
    /// - Parameters:
    ///   - staleAccessToken: The token the failed request carried. It is what
    ///     distinguishes "refresh this" from "a refresh already happened and
    ///     you missed it" — see this type's note on case 3.
    ///   - baseURL: The origin the rejected request went to, so a refresh
    ///     cannot be sent anywhere the app was not already talking to. It comes
    ///     from the request rather than from storage on purpose: a device's BFM
    ///     address would otherwise need a second home, and two sources for one
    ///     value is one more than can be kept in step.
    /// - Throws: ``SessionRefreshError``. Every case but
    ///   ``SessionRefreshError/unavailable(_:)`` has already moved the session
    ///   by the time it is thrown.
    public func refreshedTokens(
        replacing staleAccessToken: String,
        at baseURL: URL
    ) async throws -> DeviceTokens {
        let snapshot = try await refreshedCredentials(
            replacing: staleAccessToken,
            at: baseURL
        )
        guard let tokens = snapshot.tokens else { throw SessionRefreshError.unauthenticated }
        return tokens
    }

    internal func refreshedCredentials(
        replacing staleAccessToken: String,
        at baseURL: URL
    ) async throws -> CredentialTokenSnapshot {
        if let current = await currentCredentialSnapshot(),
            let tokens = current.tokens,
            tokens.accessToken != staleAccessToken
        {
            return current
        }
        if let rotation { return try await rotation.value }

        // Assigned before the first suspension point, so no caller can observe
        // the gap between deciding to refresh and this being visible to the
        // next one. `Task {}` in an actor-isolated scope inherits that
        // isolation, so the body cannot begin until this method suspends below.
        //
        // `rotation` outlives the task it holds by one hop: it is cleared when
        // this frame resumes, not when the task finishes. A caller entering in
        // that window awaits a task that has already completed and gets its
        // result — which is what it wanted unless the token it holds *is* that
        // result, and in that case it retries once, is rejected again, and the
        // middleware escalates. There is no loop in it, so closing the window
        // would buy a wasted round trip in a case that is already handled.
        let task = Task { try await self.rotateTokens(replacing: staleAccessToken, at: baseURL) }
        rotation = task
        defer { rotation = nil }
        return try await task.value
    }

    /// The BFM answered `403` on some other request: an operator cut this
    /// device off. Destroys what is on the device and ends the session.
    ///
    /// Single-flighted for the same reason the rotation is — a screen's worth
    /// of concurrent requests all get the same `403`, and there is no reason
    /// for twenty of them to each wipe a keychain.
    func deviceWasRevoked() async {
        _ = await revokeCredentials(ifRevision: nil)
    }

    internal func deviceWasRevoked(ifRevision revision: UInt64) async -> Bool {
        await revokeCredentials(ifRevision: revision)
    }

    #if DEBUG
        internal func observeRevocationJoins(_ observer: @escaping @Sendable () -> Void) {
            revocationJoinObserver = observer
        }

        internal func observeRevocationPrechecks(
            _ observer: @escaping @Sendable () async -> Void
        ) {
            revocationPrecheckObserver = observer
        }
    #endif
}

internal struct RevocationFlight {
    let id: UUID
    let revision: UInt64?
    let task: Task<Bool, Never>
}
