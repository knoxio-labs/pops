import AppCore

/// A finance account named by a routed reference.
public struct AccountEntity: Hashable, Sendable, Identifiable {
    /// The pillar segment on every account reference.
    public static let pillar = "finance"

    /// The type segments this feature can open.
    public static let types = ["account"]

    /// The account the reference names.
    public let accountId: Account.ID

    /// Creates an entity when the URI names a finance account.
    public init?(_ uri: PopsURI) {
        guard uri.pillar == Self.pillar, uri.type == "account" else { return nil }
        accountId = uri.id
    }

    /// The account identifier used by SwiftUI presentation.
    public var id: String { accountId }
}
