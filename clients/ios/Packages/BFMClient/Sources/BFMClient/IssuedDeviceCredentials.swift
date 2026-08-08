import Foundation

/// What a successful pairing hands back — the device's whole identity, issued
/// exactly once.
///
/// The BFM keeps only a digest of the refresh token, so these bytes are the
/// single copy in existence: a response that reaches this type and is then
/// dropped costs a fresh pairing code. Hand-written rather than the generated
/// payload it is built from, for the reason ``BFMHealth`` states.
///
/// ``expiresInSeconds`` is carried as the server sent it rather than resolved
/// to a `Date` here. Turning a duration into a deadline needs a clock, and a
/// clock is a dependency this module has no business choosing on a caller's
/// behalf — the store that persists the pair owns that decision and can be
/// tested against a fixed one.
public struct IssuedDeviceCredentials: Sendable, Equatable {
    public let deviceId: String
    public let accessToken: String
    public let refreshToken: String
    /// Seconds the access token stays valid, counted from this response.
    public let expiresInSeconds: Int

    public init(
        deviceId: String,
        accessToken: String,
        refreshToken: String,
        expiresInSeconds: Int
    ) {
        self.deviceId = deviceId
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.expiresInSeconds = expiresInSeconds
    }
}

// Interpolating a value into a log line is the easiest way for a token to
// escape, and it is a single character to write by accident. Both string
// conversions are redacted so that the accident is harmless — the same
// treatment `DeviceTokens` gets in `Auth`, applied here because this type is
// where the tokens first exist.
extension IssuedDeviceCredentials: CustomStringConvertible, CustomDebugStringConvertible {
    public var description: String { "IssuedDeviceCredentials(redacted)" }
    public var debugDescription: String { "IssuedDeviceCredentials(redacted)" }
}

/// Why the BFM refused to pair, as the contract documents it.
///
/// Three cases rather than one because they lead to three different next
/// actions, and the split is only safe to expose because the producer made it
/// safe: the handler validates the public key *before* it touches the code, so
/// a 400 cannot be read as "the code was right". See
/// `pillars/bfm/src/contract/rest-device-schemas.ts`.
public enum DevicePairingRefusal: Hashable, Sendable {
    /// `400 invalid_request` — the request itself was wrong. A malformed public
    /// key lands here, which makes this a defect in the app rather than
    /// anything the person holding it did.
    case invalidRequest

    /// `403 pairing_rejected` — the code did not buy a device. Unknown, expired
    /// and already-consumed are byte-for-byte identical on purpose, so nothing
    /// downstream may claim to know which.
    case codeRejected

    /// `429 rate_limited` — too many attempts from this address.
    case rateLimited(retryAfterSeconds: Int)
}
