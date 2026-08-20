import AppCore

extension ReceiptPurchase {
    /// Local to this target for the reason the fixtures below are: the values
    /// are chosen so that a copy assertion reads as the sentence a user would
    /// see, and `AppCoreFakes`' own defaults answer to a different suite.
    internal static func fake(
        id: String = "purchase-1",
        merchantName: String? = "Test Grocer",
        total: MoneyAmount = MoneyAmount(minorUnits: 8420, currencyCode: "AUD"),
        orderedAt: String = "2026-08-01T04:32:00.000Z",
        itemCount: Int = 12
    ) -> ReceiptPurchase {
        ReceiptPurchase(
            id: id,
            merchantName: merchantName,
            total: total,
            orderedAt: orderedAt,
            itemCount: itemCount
        )
    }
}

extension ExtractedReceipt {
    internal static func fake(
        merchantName: String? = "Test Grocer",
        address: String? = "1 Test Street",
        purchasedOn: String? = "2026-08-01",
        purchasedAt: String? = "14:32",
        currency: String? = "AUD",
        total: String = "42.50",
        tax: String? = "3.86",
        discounts: [String] = [],
        surcharges: [String] = [],
        shipping: String? = nil,
        lines: [ExtractedReceiptLine] = [.fake()],
        unreadableNotes: [String] = []
    ) -> ExtractedReceipt {
        ExtractedReceipt(
            merchantName: merchantName,
            address: address,
            purchasedOn: purchasedOn,
            purchasedAt: purchasedAt,
            currency: currency,
            total: total,
            tax: tax,
            discounts: discounts,
            surcharges: surcharges,
            shipping: shipping,
            lines: lines,
            unreadableNotes: unreadableNotes
        )
    }
}

extension ExtractedReceiptLine {
    internal static func fake(
        description: String = "Milk",
        amount: String = "4.50",
        quantity: Int? = nil,
        unitNote: String? = nil
    ) -> ExtractedReceiptLine {
        ExtractedReceiptLine(
            description: description, amount: amount, quantity: quantity, unitNote: unitNote)
    }
}

extension ReceiptGateFailure {
    internal static func fake(
        kind: ReceiptGateFailureKind = .sumMismatch,
        detail: String = "Lines summed to 40.00, receipt states 42.50",
        deltaCents: Int? = -250
    ) -> ReceiptGateFailure {
        ReceiptGateFailure(kind: kind, detail: detail, deltaCents: deltaCents)
    }
}
