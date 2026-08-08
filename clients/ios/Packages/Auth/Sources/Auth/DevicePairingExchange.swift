import BFMClient
import Foundation

/// The single BFM call the pairing flow makes, named as a protocol so
/// ``BFMDevicePairingService`` can be tested without a network or a stubbed
/// `URLProtocol`.
///
/// It exists because ``BFMHTTPClient``'s transport-injecting initialiser is
/// `internal` to `BFMClient`, and deliberately so — a caller choosing its own
/// transport is choosing its own timeouts, redirects and TLS behaviour. That
/// leaves this package with no seam of its own, so it declares one and the real
/// client satisfies it as written.
///
/// The types crossing this boundary are `BFMClient`'s rather than new ones.
/// Restating them here would be a second wire vocabulary to keep in step with
/// the generated client, which is the failure the regenerate-and-diff gate
/// exists to prevent.
public protocol DevicePairingExchange: Sendable {
    func pairDevice(
        code: String,
        publicKeyBase64DER: String,
        deviceName: String,
        deviceModel: String
    ) async throws -> IssuedDeviceCredentials
}

/// No adapter: the protocol was written to the client's existing signature, so
/// a change on either side is a compile error here rather than a wrapper that
/// silently keeps translating.
extension BFMHTTPClient: DevicePairingExchange {}
