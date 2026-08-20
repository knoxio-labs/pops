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
}
