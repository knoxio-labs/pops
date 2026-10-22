import Foundation

/// The device credential, attached to a request the generated client cannot
/// make: Ego's event stream and the item-document byte routes.
///
/// It is the generated client's authentication rule restated for a
/// `URLRequest`, and the one place it is: send with the current token, and on
/// a `401` refresh once through the shared refresher and send once more. A
/// `403` revokes the device only when its body says so explicitly.
internal struct BFMRawAuthorization: Sendable {
    internal struct Exchange<Payload: Sendable>: Sendable {
        internal let response: HTTPURLResponse
        internal let payload: Payload
        /// The credential the answered request carried.
        internal let credential: BFMStreamCredential?
        /// Every token the exchange sent, for redacting a rejected body.
        internal let tokens: [String]
    }

    internal let baseURL: URL
    private let authorizer: any BFMStreamAuthorizer

    internal init(baseURL: URL, authorizer: any BFMStreamAuthorizer) {
        self.baseURL = baseURL
        self.authorizer = authorizer
    }

    /// - Parameters:
    ///   - send: Makes the request with the token given, `nil` without a session.
    ///   - discard: Releases a `401`'s payload before the retry.
    internal func exchange<Payload: Sendable>(
        _ send: (String?) async throws -> (HTTPURLResponse, Payload),
        discard: (Payload) async -> Void
    ) async throws -> Exchange<Payload> {
        let credential = await authorizer.currentStreamCredential()
        let (response, payload) = try await send(credential?.accessToken)
        guard response.statusCode == 401, let credential else {
            return Exchange(
                response: response, payload: payload, credential: credential,
                tokens: credential.map { [$0.accessToken] } ?? [])
        }
        await discard(payload)
        let refreshed = try await authorizer.refreshedStreamCredential(
            replacing: credential.accessToken, at: baseURL)
        let (retry, retryPayload) = try await send(refreshed.accessToken)
        return Exchange(
            response: retry, payload: retryPayload, credential: refreshed,
            tokens: [credential.accessToken, refreshed.accessToken])
    }

    /// Ends the session when a refusal is an explicit device revocation.
    internal func noteRefusal(status: Int, body: Data, credential: BFMStreamCredential?) async {
        guard status == 403, Self.isDeviceRevocation(body), let credential else { return }
        await authorizer.deviceWasRevoked(ifCredentialRevision: credential.revision)
    }

    internal static func authorize(_ request: inout URLRequest, accessToken: String?) {
        guard let accessToken else { return }
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    }

    private static func isDeviceRevocation(_ body: Data) -> Bool {
        guard let refusal = try? JSONDecoder().decode(Refusal.self, from: body) else {
            return false
        }
        return refusal.code == "bfm.auth.device_revoked" || refusal.code == "device_revoked"
    }

    private struct Refusal: Decodable {
        let code: String?
    }
}
