/// Everything that can move the session. `Auth` sends these; features read the
/// resulting state.
public enum SessionEvent: Hashable, Sendable {
    case paired(PairedDevice)
    case revoked(RevocationReason, credentialRevision: UInt64?)
    case signedOut

    /// Ends a session without tying the event to one credential identity.
    public static func revoked(_ reason: RevocationReason) -> SessionEvent {
        .revoked(reason, credentialRevision: nil)
    }

    /// Ends only the session whose credential revision produced the response.
    public static func revoked(
        _ reason: RevocationReason,
        ifCredentialRevision revision: UInt64
    ) -> SessionEvent {
        .revoked(reason, credentialRevision: revision)
    }
}

/// Session transitions as a pure function. Every screen that would otherwise
/// handle "the device is gone" locally instead reads one value that moved here.
public enum SessionReducer {
    /// Applies an event while keeping revision-bound revocations until a newer pairing replaces them.
    public static func reduce(_ state: SessionState, applying event: SessionEvent) -> SessionState {
        switch event {
        case .paired(let device):
            if case .revoked(let reason, let revision?) = state,
                device.credentialRevision <= revision
            {
                return .revoked(reason, credentialRevision: revision)
            }
            return .paired(device)
        case .revoked(let reason, .some(let revision)):
            switch state {
            case .paired(let device) where device.credentialRevision > revision:
                return state
            case .revoked(_, let currentRevision?) where currentRevision >= revision:
                return state
            default:
                return .revoked(reason, credentialRevision: revision)
            }
        case .revoked(let reason, nil):
            switch state {
            case .unpaired, .revoked:
                return state
            case .paired:
                return .revoked(reason)
            }
        case .signedOut:
            return .unpaired
        }
    }
}
