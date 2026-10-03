import AppCore

/// A finance transaction named by a routed reference.
public struct TransactionEntity: Hashable, Sendable, Identifiable {
    /// The pillar segment on every transaction reference.
    public static let pillar = "finance"

    /// The type segments this feature can open.
    public static let types = ["transaction"]

    /// The transaction the reference names.
    public let transactionId: Transaction.ID

    /// Creates an entity when the URI names a finance transaction.
    public init?(_ uri: PopsURI) {
        guard uri.pillar == Self.pillar, uri.type == "transaction" else { return nil }
        transactionId = uri.id
    }

    /// The transaction identifier used by SwiftUI presentation.
    public var id: String { transactionId }
}
