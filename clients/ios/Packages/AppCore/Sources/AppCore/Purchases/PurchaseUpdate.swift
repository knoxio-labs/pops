import Foundation

/// The complete desired value of one purchase line in an update.
///
/// A non-nil `id` addresses an existing line. A nil `id` asks the server to create one.
public struct PurchaseUpdateLine: Hashable, Sendable {
    public let id: String?
    public let name: String
    public let quantity: Int
    public let lineTotalCents: Int

    /// Creates an existing or new line in a purchase update.
    public init(id: String?, name: String, quantity: Int, lineTotalCents: Int) {
        self.id = id
        self.name = name
        self.quantity = quantity
        self.lineTotalCents = lineTotalCents
    }
}

/// The editable purchase values sent to the repository.
///
/// `lines` is the complete desired line set. `expectedUpdatedAt` lets the server reject an edit
/// made against stale content.
public struct PurchaseUpdate: Hashable, Sendable {
    public let merchantEntityID: String?
    public let merchantEntityName: String?
    public let orderedAt: Date?
    public let totalCents: Int?
    public let subtotalCents: Int?
    public let taxCents: Int?
    public let shippingCents: Int?
    public let discountCents: Int?
    public let surchargeCents: Int?
    public let lines: [PurchaseUpdateLine]
    public let expectedUpdatedAt: String

    /// Creates the repository input for a saved-purchase edit.
    public init(
        merchantEntityID: String? = nil,
        merchantEntityName: String? = nil,
        orderedAt: Date? = nil,
        totalCents: Int? = nil,
        subtotalCents: Int? = nil,
        taxCents: Int? = nil,
        shippingCents: Int? = nil,
        discountCents: Int? = nil,
        surchargeCents: Int? = nil,
        lines: [PurchaseUpdateLine],
        expectedUpdatedAt: String
    ) {
        self.merchantEntityID = merchantEntityID
        self.merchantEntityName = merchantEntityName
        self.orderedAt = orderedAt
        self.totalCents = totalCents
        self.subtotalCents = subtotalCents
        self.taxCents = taxCents
        self.shippingCents = shippingCents
        self.discountCents = discountCents
        self.surchargeCents = surchargeCents
        self.lines = lines
        self.expectedUpdatedAt = expectedUpdatedAt
    }
}
