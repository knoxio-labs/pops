import BFMClient
import Foundation

/// Shares the refresher already held by `AuthenticatingMiddleware` with Ego's byte stream.
/// Refreshes started by either caller join the same single flight, so the device's token family
/// is never spent twice.
extension DeviceSessionRefresher: BFMStreamAuthorizer {
    public func currentStreamCredential() async -> BFMStreamCredential? {
        guard let snapshot = await currentCredentialSnapshot(),
            let tokens = snapshot.tokens
        else {
            return nil
        }
        return BFMStreamCredential(accessToken: tokens.accessToken, revision: snapshot.revision)
    }

    public func refreshedStreamCredential(
        replacing staleAccessToken: String,
        at baseURL: URL
    ) async throws -> BFMStreamCredential {
        let snapshot = try await refreshedCredentials(
            replacing: staleAccessToken,
            at: baseURL
        )
        guard let tokens = snapshot.tokens else { throw SessionRefreshError.unauthenticated }
        return BFMStreamCredential(accessToken: tokens.accessToken, revision: snapshot.revision)
    }

    public func deviceWasRevoked(ifCredentialRevision revision: UInt64) async {
        _ = await deviceWasRevoked(ifRevision: revision)
    }
}
