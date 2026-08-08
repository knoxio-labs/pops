import Foundation

/// What a pairing attempt needs.
///
/// ``baseURL`` and ``code`` arrive together from a scanned QR code, so a fresh
/// install needs neither typing nor a compiled-in hostname. The two device
/// fields are the operator's only way to tell one handset from another on the
/// revoke screen, and they come from the pairing screen rather than from the
/// service: iOS reports a generic `iPhone` for every device unless the app
/// holds an entitlement Apple grants by application, so the name is something
/// the person confirms rather than something the phone knows.
public struct PairingRequest: Hashable, Sendable {
    public let baseURL: URL
    public let code: String
    /// Operator-facing label, e.g. `Joao's iPhone`.
    public let deviceName: String
    /// Hardware identifier as the handset reports it, e.g. `iPhone17,1`.
    public let deviceModel: String

    public init(baseURL: URL, code: String, deviceName: String, deviceModel: String) {
        self.baseURL = baseURL
        self.code = code
        self.deviceName = deviceName
        self.deviceModel = deviceModel
    }
}

/// Why pairing did not happen, split by what the user can do about it.
///
/// The split is the point. Every case below leads to different words on screen
/// and a different next action, which is why the BFM's four documented
/// outcomes are not collapsed into one "pairing failed": a rate-limited device
/// told to generate a new code will generate one and be rate-limited again.
public enum PairingError: Error, Hashable, Sendable {
    /// The BFM answers unknown, expired and consumed codes identically on
    /// purpose, so the app must not pretend to know which one it was — it can
    /// only say the code did not work and to generate another.
    case codeRejected

    /// Too many attempts from this address. Waiting is the only thing that
    /// helps, and the BFM says for how long.
    case rateLimited(retryAfterSeconds: Int)

    /// The BFM refused the request itself rather than the code — a public key
    /// it could not parse, or a field outside the contract's bounds. The user
    /// cannot act on it and retrying the same bytes cannot fix it: this is a
    /// defect in this build, and saying "that code did not work" instead would
    /// send them to mint codes forever against a bug.
    case invalidRequest

    /// Nothing answered at that base URL, or what answered was not a BFM that
    /// could speak for itself.
    case unreachable

    /// The device key could not be created, so there is nothing to pair with.
    case keyGenerationFailed

    /// The BFM issued credentials this device then failed to store. The device
    /// exists on the server and cannot be used, so the recovery is to revoke it
    /// there and pair again — distinct from every case above, where nothing was
    /// created.
    case credentialStorageFailed

    /// The composition root never bound an implementation. Reachable only
    /// through ``AppDependencies/unbound``.
    case dependencyNotBound
}

/// Turning a pairing code into a paired device.
public protocol DevicePairingService: Sendable {
    /// Creates the device key, exchanges the code and persists the resulting
    /// credentials. The caller commits the returned device to ``SessionStore``.
    ///
    /// Leaves no key behind on failure: an attempt that generated a key and
    /// then could not spend it deletes the key before throwing, so a retry
    /// pairs one key rather than orphaning the first on the server.
    func pair(_ request: PairingRequest) async throws -> PairedDevice
}
