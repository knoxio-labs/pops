import Foundation

/// A device that has completed pairing, as the app knows it. Token material
/// stays in `Auth` and never reaches this type.
public struct PairedDevice: Hashable, Sendable, Identifiable {
    public let id: String
    /// Arrives with the pairing code rather than being compiled in, so a fresh
    /// install can be pointed at a different BFM without a new build.
    public let baseURL: URL
    /// Local revision of the credential identity that produced this session.
    public let credentialRevision: UInt64

    public init(id: String, baseURL: URL, credentialRevision: UInt64 = 0) {
        self.id = id
        self.baseURL = baseURL
        self.credentialRevision = credentialRevision
    }
}

/// Why the app is back at pairing. The user is told which of these happened —
/// a silent bounce to the pairing screen reads as a bug.
public enum RevocationReason: Hashable, Sendable {
    /// The BFM answered `403`: the operator revoked this device.
    case revokedByOperator
    /// Refresh was rejected, so the stored credentials cannot be recovered.
    case credentialsRejected
}

/// The whole of what the root view switches on.
public enum SessionState: Hashable, Sendable {
    case unpaired
    case paired(PairedDevice)
    /// A revoked credential revision remains a tombstone until pairing a newer revision.
    case revoked(RevocationReason, credentialRevision: UInt64? = nil)
}
