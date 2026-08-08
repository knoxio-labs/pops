/// Everything that can move the session. `Auth` sends these; features read the
/// resulting state.
public enum SessionEvent: Hashable, Sendable {
    case paired(PairedDevice)
    case revoked(RevocationReason)
    case signedOut
}

/// Session transitions as a pure function. Every screen that would otherwise
/// handle "the device is gone" locally instead reads one value that moved here.
public enum SessionReducer {
    public static func reduce(_ state: SessionState, applying event: SessionEvent) -> SessionState {
        switch (state, event) {
        case let (_, .paired(device)):
            return .paired(device)
        case (.unpaired, .revoked):
            // There is nothing to revoke. A `403` racing a sign-out must not
            // strand the user on an explanation for a device they no longer have.
            return .unpaired
        case (.revoked, .revoked):
            // Concurrent requests all fail once the device is gone. The first
            // reason is the one that explains it; later ones must not overwrite it.
            return state
        case let (.paired, .revoked(reason)):
            return .revoked(reason)
        case (_, .signedOut):
            return .unpaired
        }
    }
}
