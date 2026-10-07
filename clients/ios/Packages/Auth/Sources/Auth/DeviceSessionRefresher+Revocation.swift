import AppCore
import BFMClient
import Foundation

extension DeviceSessionRefresher {
    /// Applies a failure to the session, then reports it.
    ///
    /// The order is the point: the state has already moved by the time the
    /// caller sees the error, so a caller that swallows it cannot leave the app
    /// showing a signed-in shell for a device that is no longer paired.
    func escalated(
        _ error: any Error,
        ifRevision revision: UInt64
    ) async -> SessionRefreshError {
        let outcome = Self.outcome(for: error)
        switch outcome.sessionEvent {
        case .revoked(.revokedByOperator, _):
            guard await deviceWasRevoked(ifRevision: revision) else {
                return .unavailable("credentials changed during refresh")
            }
        case .revoked(.credentialsRejected, _):
            // Through the latch, because `currentTokens()` may already have
            // said exactly this about the same corrupt blob a moment earlier.
            await reportCredentialsRejected(ifRevision: revision)
        case nil:
            break
        case .some(let event):
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
    /// replacement pairing preserves them until the BFM accepts the new code.
    func reportCredentialsRejected(ifRevision revision: UInt64) async {
        guard reportedCredentialsRejectedRevision != revision else { return }
        reportedCredentialsRejectedRevision = revision
        await sessionEvents.send(.revoked(.credentialsRejected, ifCredentialRevision: revision))
    }

    func revokeCredentials(ifRevision revision: UInt64?) async -> Bool {
        while let active = revocation {
            if active.revision == revision {
                #if DEBUG
                    revocationJoinObserver()
                #endif
                return await active.task.value
            }
            _ = await active.task.value
            if revocation?.id == active.id { revocation = nil }
        }
        let id = UUID()
        let task = Task { await self.destroyCredentials(ifRevision: revision) }
        revocation = RevocationFlight(id: id, revision: revision, task: task)
        let destroyed = await task.value
        if revocation?.id == id { revocation = nil }
        return destroyed
    }

    private func destroyCredentials(ifRevision revision: UInt64?) async -> Bool {
        do {
            if let revision {
                guard try credentialStore.wipe(ifRevision: revision) else { return false }
            } else {
                try credentialStore.wipe()
            }
        } catch is DeviceCredentialWipeError {
        } catch {
            guard revision == nil else { return false }
        }
        credentialEpoch += 1
        reportedCredentialsRejectedRevision = nil
        if let revision {
            await sessionEvents.send(.revoked(.revokedByOperator, ifCredentialRevision: revision))
        } else {
            await sessionEvents.send(.revoked(.revokedByOperator))
        }
        return true
    }
}
