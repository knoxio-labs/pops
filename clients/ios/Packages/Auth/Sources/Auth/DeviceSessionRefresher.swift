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
    private let credentialStore: DeviceCredentialStore
    private let exchange: @Sendable (URL) -> any DeviceRefreshExchange
    private let sessionEvents: any SessionEventSink
    private let now: @Sendable () -> Date

    private var rotation: Task<DeviceTokens, any Error>?
    private var revocation: Task<Void, Never>?

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

    /// The stored pair, or `nil` when this device is unpaired or wiped.
    ///
    /// A read failure is reported as `nil` rather than thrown. The caller is a
    /// middleware about to send a request, and its two options are "attach a
    /// token" and "do not"; a keychain that cannot be read leaves it with the
    /// second either way.
    public func currentTokens() -> DeviceTokens? {
        try? credentialStore.tokenStore.load()
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
        if let alreadyRotated = currentTokens(), alreadyRotated.accessToken != staleAccessToken {
            return alreadyRotated
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
        let task = Task { try await self.rotateTokens(at: baseURL) }
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
    public func deviceWasRevoked() async {
        if let revocation { return await revocation.value }
        let task = Task { await self.destroyCredentials() }
        revocation = task
        defer { revocation = nil }
        await task.value
    }
}

extension DeviceSessionRefresher {
    private func rotateTokens(at baseURL: URL) async throws -> DeviceTokens {
        do {
            let tokens = try await spendStoredGrant(at: baseURL)
            do {
                try credentialStore.tokenStore.save(tokens)
            } catch {
                // The presented token is already dead on the server and this
                // was the only copy of its successor. Nothing is left to
                // refresh with, so this ends the session exactly as a refusal
                // does — it is not a storage problem to retry past.
                throw SessionRefreshError.credentialsRejected
            }
            return tokens
        } catch {
            throw await escalated(error)
        }
    }

    /// Challenge, sign, exchange — with the contract's own one retry.
    ///
    /// `challengeExpired` says the nonce, not the credential, was the problem;
    /// the documented recovery is to fetch another and try again once. A second
    /// expiry in a row is a server that is not keeping its nonces, not a reason
    /// to destroy a device's identity, so it falls through to
    /// ``SessionRefreshError/unavailable(_:)`` like any other server fault.
    private func spendStoredGrant(at baseURL: URL) async throws -> DeviceTokens {
        guard let current = currentTokens() else { throw SessionRefreshError.unauthenticated }
        let client = exchange(baseURL)
        do {
            return try await spend(current, with: client)
        } catch BFMClientError.refreshRefused(.challengeExpired) {
            return try await spend(current, with: client)
        }
    }

    /// ``RefreshChallenge/expiresInSeconds`` is deliberately not read.
    ///
    /// It exists so a caller holding a nonce already can decide whether it is
    /// still worth spending a refresh token against. This one never holds one:
    /// a nonce is fetched, signed and spent inside a single call, so there is
    /// no window in which it could go stale that a clock comparison would catch
    /// and the server's own rejection would not. Reading it would be a second,
    /// drifting opinion about the same fact.
    private func spend(
        _ current: DeviceTokens,
        with client: any DeviceRefreshExchange
    ) async throws -> DeviceTokens {
        let challenge = try await client.challenge()
        let signature = try credentialStore.keyStore.signature(
            for: RefreshSignatureMessage.bytes(
                nonce: challenge.nonce,
                refreshToken: current.refreshToken
            )
        )
        let session = try await client.refresh(
            refreshToken: current.refreshToken,
            nonce: challenge.nonce,
            signatureBase64: signature.base64EncodedString()
        )
        return DeviceTokens(
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
            accessTokenExpiresAt: now()
                .addingTimeInterval(TimeInterval(session.expiresInSeconds))
        )
    }

    /// Applies a failure to the session, then reports it.
    ///
    /// The order is the point: the state has already moved by the time the
    /// caller sees the error, so a caller that swallows it cannot leave the app
    /// showing a signed-in shell for a device that is no longer paired.
    private func escalated(_ error: any Error) async -> SessionRefreshError {
        let outcome = Self.outcome(for: error)
        if outcome == .deviceRevoked {
            await deviceWasRevoked()
        } else if let event = outcome.sessionEvent {
            await sessionEvents.send(event)
        }
        return outcome
    }

    /// Pure, so the mapping can be read — and tested — without a refresh.
    private static func outcome(for error: any Error) -> SessionRefreshError {
        if let refresh = error as? SessionRefreshError { return refresh }
        // A device that has lost its Enclave key can never prove possession
        // again, whatever the token says. Every other key-store failure —
        // a device locked mid-refresh, most of all — is transient.
        if error as? DeviceKeyStoreError == .keyNotFound { return .credentialsRejected }
        guard case .refreshRefused(let refusal)? = error as? BFMClientError else {
            return .unavailable(String(describing: error))
        }
        switch refusal {
        case .deviceRevoked: return .deviceRevoked
        case .invalidGrant: return .credentialsRejected
        // A rate limit, a request this build got wrong, and a nonce that
        // expired twice are all server-side or app-side faults that leave the
        // credential intact. Retrying is the correct response to each; wiping
        // is not.
        case .challengeExpired, .invalidRequest, .rateLimited: return .unavailable("\(refusal)")
        }
    }

    /// Best effort, and deliberately silent about its own failure.
    ///
    /// The event is sent regardless. A keychain that would not give up its
    /// contents is a worse state than one that did, and the response to it is
    /// still to stop using those credentials and send the user to pair again —
    /// which is what re-pairing then wipes.
    private func destroyCredentials() async {
        try? credentialStore.wipe()
        await sessionEvents.send(.revoked(.revokedByOperator))
    }
}
