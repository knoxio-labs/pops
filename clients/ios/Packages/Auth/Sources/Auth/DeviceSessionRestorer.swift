import AppCore

/// What a cold launch finds on the device.
///
/// Both halves have to be there. An identity with no tokens cannot make a
/// request, and tokens with no identity name no BFM to send them to — a Release
/// build ships no hostname, so a device that has forgotten where its BFM is has
/// forgotten everything that matters. Either alone resolves to `unpaired`,
/// which puts the person on the pairing screen rather than on a shell whose
/// every request fails.
///
/// ## What it does not do
///
/// It does not check whether the credentials still *work*. That would put a
/// network round trip on the launch path, and the app would show nothing until
/// a server answered — including on a train, where the honest thing to render
/// is the list the device already has. A revocation is discovered by the first
/// real request, which `AuthenticatingMiddleware` already turns into a session
/// event, and the root moves to the pairing screen with an explanation.
///
/// It also does not wipe what it could not use. Pairing keeps the current
/// identity active until the server accepts its replacement, so destroying it
/// here would only add a way for a transient read failure to cost a device its
/// identity.
public struct DeviceSessionRestorer: SessionRestoring {
    private let credentialStore: DeviceCredentialStore

    public init(credentialStore: DeviceCredentialStore) {
        self.credentialStore = credentialStore
    }

    public func restoredSession() async -> SessionState {
        guard let snapshot = try? credentialStore.restoreSnapshot(),
            let device = snapshot.device,
            snapshot.tokens != nil
        else {
            return .unpaired
        }
        return .paired(device)
    }
}
