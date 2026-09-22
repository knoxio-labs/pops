import Foundation

/// A recorded edit to a saved purchase.
public struct PurchaseEdit: Hashable, Sendable {
    public let editedAt: Date
    public let changes: [PurchaseFieldChange]

    /// Creates an edit record at the supplied time with its ordered field changes.
    public init(editedAt: Date, changes: [PurchaseFieldChange]) {
        self.editedAt = editedAt
        self.changes = changes
    }
}

/// One field changed by a saved-purchase edit.
public struct PurchaseFieldChange: Hashable, Sendable {
    public let field: PurchaseEditField
    public let itemID: String?
    public let original: String?
    public let current: String?

    /// Creates a header or line-item field change.
    public init(
        field: PurchaseEditField,
        itemID: String?,
        original: String?,
        current: String?
    ) {
        self.field = field
        self.itemID = itemID
        self.original = original
        self.current = current
    }
}

/// A field named by the purchase edit record, preserving fields added by newer servers.
public enum PurchaseEditField: Hashable, Sendable {
    case merchant
    case orderedOn
    case total
    case subtotal
    case tax
    case shipping
    case discount
    case surcharge
    case lineName
    case lineQuantity
    case lineTotal
    case lineAdded
    case lineRemoved
    case unrecognised(String)

    /// Creates a field from its wire spelling while retaining unknown values verbatim.
    public init(wire: String) {
        self = Self.knownByWire[wire] ?? .unrecognised(wire)
    }

    private static let knownByWire: [String: PurchaseEditField] = [
        "merchant": .merchant,
        "orderedOn": .orderedOn,
        "total": .total,
        "subtotal": .subtotal,
        "tax": .tax,
        "shipping": .shipping,
        "discount": .discount,
        "surcharge": .surcharge,
        "lineName": .lineName,
        "lineQuantity": .lineQuantity,
        "lineTotal": .lineTotal,
        "lineAdded": .lineAdded,
        "lineRemoved": .lineRemoved,
    ]
}
