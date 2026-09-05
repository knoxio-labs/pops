import AppCore
import FeaturePairing

/// The two ``RevocationReason``s a previously-paired device can be bounced
/// back here for. Built on an untouched form: the explanation is what
/// distinguishes these states, not anything about the fields underneath it.
@MainActor
internal enum PairingReturningStates {
    internal static let all: [DesignState] = [
        DesignState("revoked", "Returning: revoked by the operator") {
            PairingView(
                model: PairingSurfaceFactory.model(),
                returningBecause: .revokedByOperator
            )
        },
        DesignState("expired", "Returning: credentials could not be renewed") {
            PairingView(
                model: PairingSurfaceFactory.model(),
                returningBecause: .credentialsRejected
            )
        },
    ]
}
