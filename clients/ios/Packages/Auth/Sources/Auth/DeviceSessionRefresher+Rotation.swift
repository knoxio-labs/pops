import BFMClient
import Foundation

extension DeviceSessionRefresher {
    /// A rotation and a revocation can be in flight at once, and the rotation
    /// finishes second.
    ///
    /// Request A's token expires and a refresh goes out. The operator revokes
    /// the device. Request B meets the `/mobile` guard after that and answers
    /// `403`, so ``deviceWasRevoked()`` destroys the key and the tokens. Then
    /// A's refresh — accepted a moment earlier, before the revocation reached
    /// the row — returns a perfectly valid new pair.
    ///
    /// Writing it would put a live-looking credential back on a handset that
    /// was deliberately wiped, and leave a token pair with no Enclave key
    /// behind it: exactly the half-state ``DeviceCredentialStore/wipe()`` exists
    /// to make impossible. The persisted revision makes "did anything replace
    /// these credentials while I was away" answerable without accepting a
    /// result from an older identity.
    ///
    /// Re-escalating with the captured revision binds the wipe to the identity
    /// whose refresh was refused. A replacement that commits in this gap makes
    /// the conditional wipe a no-op.
    func rotateTokens(replacing staleAccessToken: String, at baseURL: URL) async throws
        -> CredentialTokenSnapshot
    {
        let epoch = credentialEpoch
        let captured = try captureTokenSnapshot(replacing: staleAccessToken)
        let snapshot = captured.snapshot
        if let current = captured.currentTokens {
            return CredentialTokenSnapshot(revision: snapshot.revision, tokens: current)
        }
        let revision = snapshot.revision
        do {
            guard let refreshTokens = snapshot.tokens else {
                throw SessionRefreshError.unauthenticated
            }
            let tokens = try await spendStoredGrant(
                at: baseURL,
                using: refreshTokens,
                revision: revision
            )
            guard epoch == credentialEpoch else { throw SessionRefreshError.deviceRevoked }
            try saveRotatedTokens(tokens, revision: revision, epoch: epoch)
            reportedCredentialsRejectedRevision = nil
            return CredentialTokenSnapshot(revision: revision, tokens: tokens)
        } catch {
            if epoch != credentialEpoch {
                throw SessionRefreshError.deviceRevoked
            }
            if credentialsChanged(since: revision) {
                throw SessionRefreshError.unavailable("credentials changed during refresh")
            }
            #if DEBUG
                await revocationPrecheckObserver()
            #endif
            throw await escalated(error, ifRevision: revision)
        }
    }

    private func saveRotatedTokens(
        _ tokens: DeviceTokens,
        revision: UInt64,
        epoch: Int
    ) throws {
        do {
            guard try credentialStore.saveTokens(tokens, ifRevision: revision) else {
                throw SessionRefreshError.unavailable("credentials changed during refresh")
            }
        } catch {
            if epoch != credentialEpoch {
                throw SessionRefreshError.deviceRevoked
            }
            if credentialsChanged(since: revision) {
                throw SessionRefreshError.unavailable("credentials changed during refresh")
            }
            // The presented token is already dead on the server and this was the only copy of its
            // successor. Nothing is left to refresh with, so this ends the session exactly as a
            // refusal does — it is not a storage problem to retry past.
            throw SessionRefreshError.credentialsRejected
        }
    }

    private func captureTokenSnapshot(replacing staleAccessToken: String) throws -> (
        currentTokens: DeviceTokens?, snapshot: CredentialTokenSnapshot
    ) {
        let snapshot: CredentialTokenSnapshot
        do {
            snapshot = try credentialStore.tokenSnapshot()
        } catch CredentialSnapshotError.corruptedPayload {
            throw SessionRefreshError.unauthenticated
        } catch {
            throw SessionRefreshError.unavailable("credential snapshot unreadable")
        }
        let currentTokens = snapshot.tokens.flatMap { tokens in
            tokens.accessToken == staleAccessToken ? nil : tokens
        }
        return (currentTokens, snapshot)
    }

    /// Challenge, sign, exchange — with the contract's own one retry.
    ///
    /// `challengeExpired` says the nonce, not the credential, was the problem;
    /// the documented recovery is to fetch another and try again once. A second
    /// expiry in a row is a server that is not keeping its nonces, not a reason
    /// to destroy a device's identity, so it falls through to
    /// ``SessionRefreshError/unavailable(_:)`` like any other server fault.
    private func spendStoredGrant(
        at baseURL: URL,
        using current: DeviceTokens,
        revision: UInt64
    ) async throws -> DeviceTokens {
        let client = exchange(baseURL)
        do {
            return try await spend(current, with: client, revision: revision)
        } catch BFMClientError.refreshRefused(.challengeExpired) {
            return try await spend(current, with: client, revision: revision)
        }
    }

    private func credentialsChanged(since revision: UInt64) -> Bool {
        guard let currentRevision = try? credentialStore.currentRevision() else { return true }
        return currentRevision != revision
    }

    /// Challenge, sign, exchange — one nonce, spent immediately.
    ///
    /// ``RefreshChallenge/expiresInSeconds`` is deliberately not read. It
    /// exists so a caller holding a nonce already can decide whether it is
    /// still worth spending a refresh token against; this one never holds one,
    /// because the nonce is fetched, signed and spent inside this call. There
    /// is no window in which it could go stale that a clock comparison would
    /// catch and the server's own rejection would not — and reading it would
    /// be a second, drifting opinion about the same fact.
    private func spend(
        _ current: DeviceTokens,
        with client: any DeviceRefreshExchange,
        revision: UInt64
    ) async throws -> DeviceTokens {
        let challenge = try await client.challenge()
        guard
            let signature = try credentialStore.signature(
                for: RefreshSignatureMessage.bytes(
                    nonce: challenge.nonce,
                    refreshToken: current.refreshToken
                ),
                ifRevision: revision
            )
        else {
            throw SessionRefreshError.unavailable("credentials changed during refresh")
        }
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
}
