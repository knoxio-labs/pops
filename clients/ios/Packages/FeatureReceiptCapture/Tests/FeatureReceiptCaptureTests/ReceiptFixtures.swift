import AppCore

extension ExtractedReceipt {
    internal static func fake(
        merchantName: String? = "Test Grocer",
        address: String? = "1 Test Street",
        timeZone: String? = "Australia/Sydney",
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
            timeZone: timeZone,
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
