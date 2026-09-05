import AppCore

/// Fictional receipts, typed against the app's own domain types — the
/// counterpart of ``Fixtures`` for the shapes `FeatureReceiptCapture`'s
/// screens take rather than `AppCore`'s account and transaction ones.
///
/// ``typicalExtracted`` prints the same line twice on purpose — a receipt
/// commonly does — because both ``ReceiptResultPresentation`` and
/// `ReceiptDraftPresentation` key a row by its position rather than its
/// description, and a fixture set without a repeat is one that could never
/// have caught the row that keys on the wrong thing and disappears under
/// `ForEach`.
internal enum ReceiptPlaygroundFixtures {
    internal static let purchase = ReceiptPurchase(
        id: "pur_2AK9X7QM3M0V6ZB1TYRD",
        merchantName: "Woolworths Metro",
        total: MoneyAmount(minorUnits: 8423, currencyCode: "AUD"),
        orderedAt: "2026-08-19T09:14:00.000Z",
        itemCount: 12
    )

    internal static let unreadableReason = "The image is too blurred for any line to be read."

    /// A clean read worth improving rather than fixing: the arithmetic
    /// balances, and the names are exactly what the till printed. The case
    /// `ReceiptDraftView` exists for, per this package's own README.
    internal static let tillNamesExtracted = ExtractedReceipt(
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
                description: "ZCHEETOS C&B BALLS", amount: "4.00", quantity: nil, unitNote: nil),
            ExtractedReceiptLine(
                description: "ZSOFT TCH BLK TRAY", amount: "12.00", quantity: nil, unitNote: nil),
            ExtractedReceiptLine(
                description: "ZIRONING BOARD", amount: "15.00", quantity: nil, unitNote: nil),
        ],
        unreadableNotes: []
    )

    /// A repeated line ("Reusable bag" twice), plus a torn corner over one
    /// line and a smudged total — a reading whose own arithmetic does not
    /// reach the printed total.
    internal static let typicalExtracted = ExtractedReceipt(
        merchantName: "Woolworths Metro",
        address: "412 Crown Street, Surry Hills NSW",
        purchasedOn: "2026-08-19",
        purchasedAt: "09:14",
        currency: "AUD",
        total: "84.23",
        tax: "7.66",
        discounts: ["2.00"],
        surcharges: ["0.03"],
        shipping: nil,
        lines: [
            ExtractedReceiptLine(
                description: "Reusable bag", amount: "0.15", quantity: nil, unitNote: nil),
            ExtractedReceiptLine(
                description: "Reusable bag", amount: "0.15", quantity: nil, unitNote: nil),
            ExtractedReceiptLine(
                description: "Full cream milk 2L", amount: "4.50", quantity: 2, unitNote: nil),
            ExtractedReceiptLine(
                description: "Sourdough loaf", amount: "6.00", quantity: nil, unitNote: nil),
            ExtractedReceiptLine(
                description: "Royal gala apples", amount: "7.84", quantity: nil,
                unitNote: "$4.90/kg"),
        ],
        unreadableNotes: ["The line under the apples is torn away."]
    )

    /// Legible enough to total, unreadable enough to fail on both ends: the
    /// printed total is smudged, and the sum the visible lines and
    /// adjustments come to disagrees with it anyway.
    internal static let typicalFailures: [ReceiptGateFailure] = [
        ReceiptGateFailure(
            kind: .unreadableTotal,
            detail: "The printed total is smudged and could not be read with confidence",
            deltaCents: nil),
        ReceiptGateFailure(
            kind: .sumMismatch,
            detail: "Lines and adjustments came to 81.73 against a printed 84.23",
            deltaCents: -250),
        ReceiptGateFailure(
            kind: .unreadableLine, detail: "One line below the apples could not be read",
            deltaCents: nil),
    ]

    /// A negative line with nothing marking it as a refund, a tax rate the
    /// paper does not settle, a torn edge, and a gate code this build has no
    /// name for. None of the four names the merchant, address or date line —
    /// two land on the fields they are about, and two land nowhere, which is
    /// the split ``ReceiptDraftPresentation`` exists to carry.
    internal static let hardwareExtracted = ExtractedReceipt(
        merchantName: "Bunnings Warehouse",
        address: "Alexandria NSW",
        purchasedOn: "2026-08-28",
        purchasedAt: "11:02",
        currency: "AUD",
        total: "58.40",
        tax: "5.31",
        discounts: [],
        surcharges: [],
        shipping: nil,
        lines: [
            ExtractedReceiptLine(
                description: "18V drill driver", amount: "89.00", quantity: nil, unitNote: nil),
            ExtractedReceiptLine(
                description: "Loyalty adjustment", amount: "-30.60", quantity: nil, unitNote: nil),
        ],
        unreadableNotes: ["The bottom edge is torn, hiding any lines below the drill bits."]
    )

    internal static let hardwareFailures: [ReceiptGateFailure] = [
        ReceiptGateFailure(
            kind: .negativeLine,
            detail: "A line prints a negative amount with nothing marking it as a refund",
            deltaCents: nil),
        ReceiptGateFailure(
            kind: .ambiguousTax,
            detail: "This receipt balances under both a 10% and a 0% GST reading",
            deltaCents: nil),
        ReceiptGateFailure(
            kind: .damaged,
            detail: "The bottom edge is torn, hiding any lines below the drill bits",
            deltaCents: nil),
        ReceiptGateFailure(
            kind: .unrecognised("packaging-deposit-unclear"),
            detail: "The gate flagged a reason this build has no name for",
            deltaCents: nil),
    ]

    /// A total the model could read and not one item under it — the receipt
    /// was handwritten and every line failed on its own, which is a
    /// different shape of failure from a line that read wrong.
    internal static let noLinesExtracted = ExtractedReceipt(
        merchantName: "Paddington Markets",
        address: nil,
        purchasedOn: "2026-08-30",
        purchasedAt: nil,
        currency: "AUD",
        total: "42.00",
        tax: nil,
        discounts: [],
        surcharges: [],
        shipping: nil,
        lines: [],
        unreadableNotes: ["Every item line is handwritten and none of it could be parsed."]
    )

    internal static let noLinesFailures: [ReceiptGateFailure] = [
        ReceiptGateFailure(
            kind: .noLines, detail: "No line items could be read from this receipt",
            deltaCents: nil)
    ]
}
