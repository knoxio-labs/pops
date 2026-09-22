import Foundation

/// One itemized line returned with a purchase detail.
public struct PurchaseDetailLine: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let quantity: Int
    public let lineTotal: MoneyAmount

    /// Creates an itemized purchase line.
    public init(id: String, name: String, quantity: Int, lineTotal: MoneyAmount) {
        self.id = id
        self.name = name
        self.quantity = quantity
        self.lineTotal = lineTotal
    }
}

/// The complete purchase representation supplied by the BFM detail contract.
///
/// `receiptURIs` preserves every receipt document in server order and is empty when the purchase
/// has none. The BFM contract supplies the five named charge totals below; it has no other charge,
/// finance-link, or accounting-split fields for this model to carry.
public struct PurchaseDetail: Identifiable, Hashable, Sendable {
    public var id: Purchase.ID { purchase.id }

    public let purchase: Purchase
    public let subtotal: MoneyAmount
    public let tax: MoneyAmount
    public let shipping: MoneyAmount
    public let discount: MoneyAmount
    public let surcharge: MoneyAmount
    public let source: String
    public let lines: [PurchaseDetailLine]
    public let receiptURIs: [String]
    public let edit: PurchaseEdit?
    /// The server's verbatim compare-and-swap token for an update, when supplied.
    public let updatedAt: String?

    /// Creates a complete purchase detail while preserving receipt document order.
    public init(
        purchase: Purchase,
        subtotal: MoneyAmount,
        tax: MoneyAmount,
        shipping: MoneyAmount,
        discount: MoneyAmount,
        surcharge: MoneyAmount,
        source: String,
        lines: [PurchaseDetailLine],
        receiptURIs: [String],
        edit: PurchaseEdit? = nil,
        updatedAt: String? = nil
    ) {
        self.purchase = purchase
        self.subtotal = subtotal
        self.tax = tax
        self.shipping = shipping
        self.discount = discount
        self.surcharge = surcharge
        self.source = source
        self.lines = lines
        self.receiptURIs = receiptURIs
        self.edit = edit
        self.updatedAt = updatedAt
    }
}

/// Decoded receipt bytes and the media type supplied by the server.
public struct ReceiptImage: Hashable, Sendable {
    public let mediaType: String
    public let data: Data

    /// Creates a thumbnail or full-size receipt image with its verbatim media type.
    public init(mediaType: String, data: Data) {
        self.mediaType = mediaType
        self.data = data
    }
}
