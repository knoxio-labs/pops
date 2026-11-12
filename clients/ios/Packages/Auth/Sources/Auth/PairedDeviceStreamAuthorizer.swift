import AppCore
import BFMClient
import Foundation

/// Binds raw-byte credential selection and refresh to one paired identity.
/// Callers also bind their raw transport to this device so a missing credential cannot become an unbound send.
public struct PairedDeviceStreamAuthorizer: BFMStreamAuthorizer {
    private let refresher: DeviceSessionRefresher
    private let device: PairedDevice

    /// Uses the existing single-flight rotation and conditional revocation engine; never creates a separate
    /// token family.
    public init(refresher: DeviceSessionRefresher, device: PairedDevice) {
        self.refresher = refresher
        self.device = device
    }

    /// Returns nil when this pairing no longer owns the current credentials.
    public func currentStreamCredential() async -> BFMStreamCredential? {
        await refresher.currentStreamCredential(for: device)
    }

    /// Rejects a changed origin or pairing before the refresh grant can be exchanged.
    public func refreshedStreamCredential(replacing token: String, at baseURL: URL) async throws
        -> BFMStreamCredential
    {
        try await refresher.refreshedStreamCredential(replacing: token, at: baseURL, for: device)
    }

    /// Revocation retains the original request revision and cannot remove a replacement pairing.
    public func deviceWasRevoked(ifCredentialRevision revision: UInt64) async {
        guard revision == device.credentialRevision else { return }
        _ = await refresher.deviceWasRevoked(ifRevision: revision)
    }
}

extension DeviceSessionRefresher {
    fileprivate func currentStreamCredential(for device: PairedDevice) async -> BFMStreamCredential?
    {
        guard let snapshot = await currentCredentialSnapshot(ifRevision: device.credentialRevision),
            let tokens = snapshot.tokens,
            (try? credentialStore.pairedDeviceStore.load()) == device
        else { return nil }
        return BFMStreamCredential(accessToken: tokens.accessToken, revision: snapshot.revision)
    }

    fileprivate func refreshedStreamCredential(
        replacing token: String, at baseURL: URL, for device: PairedDevice
    ) async throws -> BFMStreamCredential {
        guard baseURL == device.baseURL,
            try credentialStore.pairedDeviceStore.load() == device
        else { throw SessionRefreshError.unavailable("paired client identity changed") }
        let snapshot = try await refreshedCredentials(
            replacing: token, at: baseURL, ifRevision: device.credentialRevision)
        try device.assertCredentialOwner(snapshot, baseURL: baseURL)
        guard let tokens = snapshot.tokens else { throw SessionRefreshError.unauthenticated }
        return BFMStreamCredential(accessToken: tokens.accessToken, revision: snapshot.revision)
    }
}
