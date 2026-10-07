import AppCore
import AppCoreFakes
import Testing

/// The whole transition table: three states by three events, none of it left to
/// a screen to work out for itself.
@Suite("Session transitions")
internal struct SessionTransitionTests {
    private let device = PairedDevice.fake(id: "device-1")
    private let otherDevice = PairedDevice.fake(id: "device-2")

    @Test("unpaired + paired -> paired")
    func unpairedPairs() {
        #expect(SessionReducer.reduce(.unpaired, applying: .paired(device)) == .paired(device))
    }

    @Test("unpaired + revoked -> unpaired")
    func unpairedIgnoresRevocation() {
        #expect(
            SessionReducer.reduce(.unpaired, applying: .revoked(.revokedByOperator)) == .unpaired)
    }

    @Test("unpaired + signedOut -> unpaired")
    func unpairedIgnoresSignOut() {
        #expect(SessionReducer.reduce(.unpaired, applying: .signedOut) == .unpaired)
    }

    @Test("paired + revoked -> revoked, carrying the reason")
    func revokedMidSession() {
        let state = SessionReducer.reduce(.paired(device), applying: .revoked(.revokedByOperator))

        #expect(state == .revoked(.revokedByOperator))
    }

    @Test("a rejected refresh is a distinct reason from an operator revocation")
    func revokedByRejectedRefresh() {
        let state = SessionReducer.reduce(.paired(device), applying: .revoked(.credentialsRejected))

        #expect(state == .revoked(.credentialsRejected))
        #expect(state != .revoked(.revokedByOperator))
    }

    @Test("a revocation from an older credential revision leaves the replacement paired")
    func staleRevisionRevocationLeavesReplacementPaired() {
        let replacement = PairedDevice(
            id: "device-2",
            baseURL: .fakeBFM,
            credentialRevision: 2
        )

        let state = SessionReducer.reduce(
            .paired(replacement),
            applying: .revoked(.revokedByOperator, ifCredentialRevision: 1)
        )

        #expect(state == .paired(replacement))
    }

    @Test("a current revocation arriving before pairing remains attached to that revision")
    func revocationBeforePairingCannotResurrectRevokedCredentials() {
        let previous = PairedDevice(id: "device-1", baseURL: .fakeBFM, credentialRevision: 1)
        let replacement = PairedDevice(id: "device-2", baseURL: .fakeBFM, credentialRevision: 2)

        let revoked = SessionReducer.reduce(
            .paired(previous),
            applying: .revoked(.credentialsRejected, ifCredentialRevision: 2)
        )
        let afterDelayedPairing = SessionReducer.reduce(revoked, applying: .paired(replacement))

        #expect(revoked == .revoked(.credentialsRejected, credentialRevision: 2))
        #expect(afterDelayedPairing == revoked)
    }

    @Test("a newer credential revision clears an older revocation tombstone")
    func newerPairingClearsRevocationTombstone() {
        let nextDevice = PairedDevice(id: "device-3", baseURL: .fakeBFM, credentialRevision: 3)
        let state = SessionReducer.reduce(
            .revoked(.credentialsRejected, credentialRevision: 2),
            applying: .paired(nextDevice)
        )

        #expect(state == .paired(nextDevice))
    }

    @Test("a revocation for the current credential revision ends the session")
    func currentRevisionRevocationEndsSession() {
        let device = PairedDevice(
            id: "device-2",
            baseURL: .fakeBFM,
            credentialRevision: 2
        )

        let state = SessionReducer.reduce(
            .paired(device),
            applying: .revoked(.credentialsRejected, ifCredentialRevision: 2)
        )

        #expect(state == .revoked(.credentialsRejected, credentialRevision: 2))
    }

    @Test("paired + paired -> the newer device")
    func pairedReplacesDevice() {
        let state = SessionReducer.reduce(.paired(device), applying: .paired(otherDevice))

        #expect(state == .paired(otherDevice))
    }

    @Test("paired + signedOut -> unpaired")
    func pairedSignsOut() {
        #expect(SessionReducer.reduce(.paired(device), applying: .signedOut) == .unpaired)
    }

    @Test("revoked + paired -> paired, which is how re-pairing clears the explanation")
    func revokedRepairs() {
        let state = SessionReducer.reduce(.revoked(.revokedByOperator), applying: .paired(device))

        #expect(state == .paired(device))
    }

    @Test("revoked + revoked keeps the first reason")
    func revokedKeepsFirstReason() {
        let state = SessionReducer.reduce(
            .revoked(.revokedByOperator),
            applying: .revoked(.credentialsRejected)
        )

        #expect(state == .revoked(.revokedByOperator))
    }

    @Test("revoked + signedOut -> unpaired")
    func revokedSignsOut() {
        #expect(
            SessionReducer.reduce(.revoked(.revokedByOperator), applying: .signedOut) == .unpaired)
    }

    @Test("a burst of revocations from concurrent requests settles on one state")
    func concurrentRevocationsSettle() {
        let events: [SessionEvent] = [
            .revoked(.revokedByOperator),
            .revoked(.credentialsRejected),
            .revoked(.credentialsRejected),
        ]

        let state = events.reduce(SessionState.paired(device)) { state, event in
            SessionReducer.reduce(state, applying: event)
        }

        #expect(state == .revoked(.revokedByOperator))
    }
}
