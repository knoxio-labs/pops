import BFMClient

/// The two BFM calls a refresh makes, named as a protocol so
/// ``DeviceSessionRefresher`` can be tested without a network.
///
/// The same shape and the same reasoning as ``DevicePairingExchange``: the
/// types crossing this boundary are `BFMClient`'s rather than new ones, so a
/// change on either side is a compile error here rather than a wrapper that
/// silently keeps translating.
///
/// What is worth noticing is what this protocol does **not** carry: an access
/// token. Both operations are on the BFM's unauthenticated device surface by
/// definition — one hands out a value that is worthless on its own, and the
/// other exists precisely because the token the device had stopped working. An
/// implementation that attached a credential to either would be able to fail
/// with the `401` that triggers a refresh, from inside a refresh.
public protocol DeviceRefreshExchange: Sendable {
    /// A single-use nonce to bind the next refresh to.
    func challenge() async throws -> RefreshChallenge

    /// Spends `refreshToken` for its successor.
    ///
    /// - Parameter signatureBase64: Base64 of the DER ECDSA signature over
    ///   ``RefreshSignatureMessage/bytes(nonce:refreshToken:)``.
    func refresh(
        refreshToken: String,
        nonce: String,
        signatureBase64: String
    ) async throws -> RefreshedSession
}

/// No adapter: the protocol was written to the client's existing signatures.
extension BFMHTTPClient: DeviceRefreshExchange {}
