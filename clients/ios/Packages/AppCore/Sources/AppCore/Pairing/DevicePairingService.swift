import Foundation

/// What a pairing attempt needs. Both halves arrive together from a scanned QR
/// code, so a fresh install needs neither typing nor a compiled-in hostname.
public struct PairingRequest: Hashable, Sendable {
    public let baseURL: URL
    public let code: String

    public init(baseURL: URL, code: String) {
        self.baseURL = baseURL
        self.code = code
    }
}

/// Why pairing did not happen, split by what the user can do about it.
public enum PairingError: Error, Hashable, Sendable {
    /// The BFM answers unknown, expired and consumed codes identically on
    /// purpose, so the app must not pretend to know which one it was — it can
    /// only say the code did not work and to generate another.
    case codeRejected
    /// Nothing answered at that base URL.
    case unreachable
    /// The device key could not be created, so there is nothing to pair with.
    case keyGenerationFailed
    /// The composition root never bound an implementation. Reachable only
    /// through ``AppDependencies/unbound``.
    case dependencyNotBound
}

/// Turning a pairing code into a paired device.
public protocol DevicePairingService: Sendable {
    /// Creates the device key, exchanges the code and persists the resulting
    /// credentials. The caller commits the returned device to ``SessionStore``.
    func pair(_ request: PairingRequest) async throws -> PairedDevice
}
