import Foundation

/// The token pair the BFM issues at pairing and rotates on every refresh.
///
/// Held together rather than separately because they are only ever meaningful
/// together, and because a store that can hold one without the other is a store
/// that can be left half-wiped. See ``TokenStore``.
public struct DeviceTokens: Sendable, Equatable, Codable {
    /// Short-lived bearer token, attached to every `/mobile/*` request.
    public let accessToken: String

    /// Long-lived rotating token, spent by a proof-of-possession refresh.
    public let refreshToken: String

    /// When ``accessToken`` stops being accepted, as the server reported it.
    public let accessTokenExpiresAt: Date

    public init(accessToken: String, refreshToken: String, accessTokenExpiresAt: Date) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.accessTokenExpiresAt = accessTokenExpiresAt
    }
}

// Interpolating a value into a log line is the easiest way for a token to
// escape, and it is a single character to write by accident. Both string
// conversions are redacted so that the accident is harmless.
extension DeviceTokens: CustomStringConvertible, CustomDebugStringConvertible {
    public var description: String { "DeviceTokens(redacted)" }
    public var debugDescription: String { "DeviceTokens(redacted)" }
}

/// Persistence for ``DeviceTokens``.
///
/// The contract is deliberately whole-pair: there is no `saveAccessToken`. A
/// caller that could write one token without the other could interleave a
/// refresh with a revocation and leave a live refresh token behind a wiped
/// access token — which is precisely the state ``wipe()`` exists to make
/// impossible.
public protocol TokenStore: Sendable {
    /// The stored pair, or `nil` when the device is unpaired or has been wiped.
    func load() throws -> DeviceTokens?

    /// Replaces the stored pair. Both tokens move together or neither does.
    func save(_ tokens: DeviceTokens) throws

    /// Removes the stored pair. Idempotent, and total: after it returns
    /// successfully ``load()`` yields `nil`.
    ///
    /// This is the revocation path. A partial wipe that leaves a refresh token
    /// behind does not degrade revocation, it defeats it — the token is the
    /// whole credential.
    func wipe() throws
}

/// Why a token operation failed. As with ``DeviceKeyStoreError``, no case
/// carries token material.
public enum TokenStoreError: Error, Equatable {
    /// The Keychain rejected the operation.
    case keychain(OSStatus)

    /// The stored blob is present but is not a `DeviceTokens` — a downgrade, a
    /// truncated write, or corruption. Treated as unpaired by callers rather
    /// than crashed on.
    case corruptedPayload
}

extension TokenStoreError: CustomStringConvertible {
    public var description: String {
        switch self {
        case .keychain(let status): "keychain error \(status)"
        case .corruptedPayload: "stored token payload is not decodable"
        }
    }
}
