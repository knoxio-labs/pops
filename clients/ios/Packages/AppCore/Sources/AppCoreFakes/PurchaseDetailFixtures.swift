import AppCore
import Foundation

extension PurchaseDetailLine {
    /// Creates an itemized purchase line fixture.
    public static func fake(
        id: String = "line-1",
        name: String = "Fake item",
        quantity: Int = 1,
        lineTotal: MoneyAmount = MoneyAmount(minorUnits: 500, currencyCode: "AUD")
    ) -> PurchaseDetailLine {
        PurchaseDetailLine(id: id, name: name, quantity: quantity, lineTotal: lineTotal)
    }
}

extension PurchaseDetail {
    /// Creates a complete purchase detail fixture.
    public static func fake(
        purchase: Purchase = .fake(),
        subtotal: MoneyAmount = MoneyAmount(minorUnits: 500, currencyCode: "AUD"),
        tax: MoneyAmount = MoneyAmount(minorUnits: 0, currencyCode: "AUD"),
        shipping: MoneyAmount = MoneyAmount(minorUnits: 0, currencyCode: "AUD"),
        discount: MoneyAmount = MoneyAmount(minorUnits: 0, currencyCode: "AUD"),
        surcharge: MoneyAmount = MoneyAmount(minorUnits: 0, currencyCode: "AUD"),
        source: String = "manual",
        lines: [PurchaseDetailLine] = [.fake()],
        receiptURIs: [String] = [],
        edit: PurchaseEdit? = nil,
        updatedAt: String? = nil
    ) -> PurchaseDetail {
        PurchaseDetail(
            purchase: purchase,
            subtotal: subtotal,
            tax: tax,
            shipping: shipping,
            discount: discount,
            surcharge: surcharge,
            source: source,
            lines: lines,
            receiptURIs: receiptURIs,
            edit: edit,
            updatedAt: updatedAt
        )
    }
}

extension ReceiptImage {
    /// Creates a decoded receipt image fixture.
    public static func fake(
        mediaType: String = "image/jpeg", data: Data = Data([0x01, 0x02])
    ) -> ReceiptImage {
        ReceiptImage(mediaType: mediaType, data: data)
    }
}
