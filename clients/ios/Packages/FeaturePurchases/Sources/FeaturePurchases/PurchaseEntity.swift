import AppCore

/// A purchase named by a routed reference.
public struct PurchaseEntity: Hashable, Sendable, Identifiable {
    /// The pillar segment on every purchase reference.
    public static let pillar = "purchases"

    /// The type segments this feature can open.
    public static let types = ["purchase"]

    /// The purchase the reference names.
    public let purchaseId: Purchase.ID

    /// Creates an entity when the URI names a purchase.
    public init?(_ uri: PopsURI) {
        guard uri.pillar == Self.pillar, uri.type == "purchase" else { return nil }
        purchaseId = uri.id
    }

    /// The purchase identifier used by SwiftUI presentation.
    public var id: String { purchaseId }
}
