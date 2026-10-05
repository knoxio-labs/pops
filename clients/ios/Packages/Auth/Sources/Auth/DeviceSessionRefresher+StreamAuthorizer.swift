import BFMClient
import Foundation

/// Shares the refresher already held by `AuthenticatingMiddleware` with Ego's byte stream.
/// Refreshes started by either caller join the same single flight, so the device's token family
/// is never spent twice.
extension DeviceSessionRefresher: BFMStreamAuthorizer {
    public func currentAccessToken() async -> String? {
        await currentTokens()?.accessToken
    }

    public func refreshedAccessToken(
        replacing staleAccessToken: String,
        at baseURL: URL
    ) async throws -> String {
        try await refreshedTokens(replacing: staleAccessToken, at: baseURL).accessToken
    }
}
