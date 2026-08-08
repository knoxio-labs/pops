import Foundation

/// What a BFM answered when asked whether it was alive.
///
/// Hand-written rather than the generated `JsonPayload` it is built from, and
/// that is the whole point: the generated type's name, nesting and member types
/// are a function of the contract and of the generator's naming strategy, so
/// letting one out of this module would make regenerating the client a
/// cross-module refactor. The cost is this file; the alternative is paying it
/// again at every call site, forever.
public struct BFMHealth: Hashable, Sendable {
    /// Which pillar answered. Checked rather than trusted — a base URL that
    /// reaches *a* healthy pillar which is not the BFM is a misconfiguration
    /// that otherwise presents as everything working until the first real call.
    public let pillar: String

    /// The BFM's own version string, as it reports it.
    public let version: String

    /// When the BFM says it answered, which is not when this device received it.
    /// A phone's clock is not the server's, so this is the server's word for
    /// its own time and nothing else — do not measure latency with it.
    public let reportedAt: Date

    public init(pillar: String, version: String, reportedAt: Date) {
        self.pillar = pillar
        self.version = version
        self.reportedAt = reportedAt
    }
}
