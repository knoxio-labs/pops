import AppCore

@testable import FeatureReceiptCapture

extension ExtractedReceipt {
    /// A receipt whose reading is complete and correct, and whose items are
    /// named the way a till prints them. Nothing here is wrong, and the reader
    /// still wants to change three names — which is the case the form exists
    /// for and the one `.fake()`'s defaults cannot express.
    internal static func tillNamedItems() -> ExtractedReceipt {
        ExtractedReceipt(
            merchantName: "Kmart Broadway",
            address: "1 Bay Street, Broadway NSW",
            purchasedOn: "2026-08-20",
            purchasedAt: "17:42",
            currency: "AUD",
            total: "31.00",
            tax: nil,
            discounts: [],
            surcharges: [],
            shipping: nil,
            lines: [
                ExtractedReceiptLine(
                    description: "ZCHEETOS C&B BALLS", amount: "4.00", quantity: nil,
                    unitNote: nil),
                ExtractedReceiptLine(
                    description: "ZSOFT TCH BLK TRAY", amount: "12.00", quantity: 1,
                    unitNote: nil),
                ExtractedReceiptLine(
                    description: "ZIRONING BOARD", amount: "15.00", quantity: nil,
                    unitNote: "$15.00 ea"),
            ],
            unreadableNotes: []
        )
    }

    /// The other reason this screen opens: the reading is fine and the paper
    /// simply does not name what was bought, so the amounts are all there is.
    /// A reading that states all four adjustments, so the four rows and the
    /// four included-toggles can all be asserted against one draft. Nothing
    /// else in the suite produces a shipping line, because a till receipt has
    /// none — this is an online order.
    internal static var withEveryAdjustment: ExtractedReceipt {
        ExtractedReceipt(
            merchantName: "Uniqlo Australia",
            address: nil,
            purchasedOn: "2026-08-19",
            purchasedAt: "09:14",
            currency: "AUD",
            total: "89.90",
            tax: "8.17",
            discounts: ["10.00"],
            surcharges: ["1.50"],
            shipping: "7.95",
            lines: [
                ExtractedReceiptLine(
                    description: "HEATTECH SOCKS 3P", amount: "19.90", quantity: 2,
                    unitNote: nil),
                ExtractedReceiptLine(
                    description: "AIRISM CREW NECK T", amount: "70.00", quantity: 1,
                    unitNote: nil),
            ],
            unreadableNotes: []
        )
    }

    internal static func unnamedItems() -> ExtractedReceipt {
        ExtractedReceipt(
            merchantName: "Salvos Stores",
            address: nil,
            purchasedOn: nil,
            purchasedAt: nil,
            currency: nil,
            total: "12.00",
            tax: nil,
            discounts: [],
            surcharges: [],
            shipping: nil,
            lines: [
                ExtractedReceiptLine(
                    description: "", amount: "8.00", quantity: nil, unitNote: nil),
                ExtractedReceiptLine(
                    description: "", amount: "4.00", quantity: nil, unitNote: nil),
            ],
            unreadableNotes: []
        )
    }
}

extension ReceiptDraft {
    /// The form as a reader first meets it, built the way the app builds it
    /// rather than field by field — a fixture assembled by hand would let the
    /// suites assert against a draft the presentation could never produce.
    internal static func fake(
        _ extracted: ExtractedReceipt, failures: [ReceiptGateFailure] = []
    ) -> ReceiptDraft {
        ReceiptDraftPresentation().draft(extracted: extracted, failures: failures)
    }

    /// The same form with no receipt behind it — a purchase entered by hand.
    internal static func blank(currency: String? = nil) -> ReceiptDraft {
        ReceiptDraftPresentation().blankDraft(currency: currency)
    }

    /// The same form with a merchant chosen.
    ///
    /// A purchase may not be saved without one, so every suite that is about
    /// something *else* — a line's amount, a hint, a blank row — has to say
    /// so rather than inherit a draft that happens to be saveable. An opt-in
    /// helper keeps that visible at the call site; making `fake()` resolve a
    /// merchant would hide the real default, which is that a reading arrives
    /// attributed to nobody.
    internal func attributed(id: String = "ent-test") -> ReceiptDraft {
        var copy = self
        copy.merchantResolution = .chosen(id: id)
        return copy
    }
}
