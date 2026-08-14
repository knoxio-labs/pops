/// One line as a vision model read it off a receipt, verbatim.
///
/// Money is carried as printed rather than parsed into ``MoneyAmount`` — the
/// model transcribes what is on the paper, and turning that into cents is the
/// purchases pillar's job, checked against the receipt's own stated total
/// before anything is trusted. A screen showing this is showing a reading,
/// not a fact.
public struct ExtractedReceiptLine: Hashable, Sendable {
    public let description: String
    public let amount: String
    /// Only when the receipt states one. `nil` is different from `1`: the
    /// paper did not say, and inventing a `1` makes a weighed line look like a
    /// counted one.
    public let quantity: Int?
    /// `$4.50/kg`, `2 @ $3.00` — whatever qualifies the price, verbatim.
    public let unitNote: String?

    public init(description: String, amount: String, quantity: Int?, unitNote: String?) {
        self.description = description
        self.amount = amount
        self.quantity = quantity
        self.unitNote = unitNote
    }
}

/// What a vision model read off a receipt that did not reconcile with the
/// total the receipt itself states — the payload behind
/// ``ReceiptOutcome/needsReview(receiptURIs:failures:extracted:)``.
///
/// A reviewer's whole job is comparing this against the photograph, so every
/// field the purchases pillar's gate can fail on is carried here typed,
/// rather than folded into one opaque string the reviewer cannot check
/// anything against.
public struct ExtractedReceipt: Hashable, Sendable {
    /// As printed at the top. `nil` is a valid outcome, not a failure.
    public let merchantName: String?
    public let address: String?
    /// IANA zone the shop is in, inferred rather than printed. Carried
    /// alongside ``address`` so the inference can be checked against what was
    /// actually on the paper.
    public let timeZone: String?
    /// `YYYY-MM-DD`, as the receipt's own date format resolves to.
    public let purchasedOn: String?
    /// `HH:MM`, 24-hour, when the receipt prints one.
    public let purchasedAt: String?
    /// ISO-4217, as printed or inferred from the currency symbol.
    public let currency: String?
    /// The total the receipt states. What every line, discount, surcharge and
    /// shipping charge below is checked against.
    public let total: String
    /// Stated tax, when the receipt separates it.
    public let tax: String?
    /// Stated discounts, as positive printed amounts.
    public let discounts: [String]
    /// Fees the merchant added — a card surcharge, a small-order fee. Positive
    /// printed amounts, and a separate list from ``discounts`` because they
    /// move the total the other way.
    public let surcharges: [String]
    /// The delivery charge the receipt states, or `nil` when it states none —
    /// including a receipt printing `FREE`, which has stated no amount.
    public let shipping: String?
    public let lines: [ExtractedReceiptLine]
    /// Where the model could not read the paper — a torn corner, a smudged
    /// line — recorded so a reviewer can tell "the model is wrong" from "the
    /// receipt is damaged".
    public let unreadableNotes: [String]

    public init(
        merchantName: String?,
        address: String?,
        timeZone: String?,
        purchasedOn: String?,
        purchasedAt: String?,
        currency: String?,
        total: String,
        tax: String?,
        discounts: [String],
        surcharges: [String],
        shipping: String?,
        lines: [ExtractedReceiptLine],
        unreadableNotes: [String]
    ) {
        self.merchantName = merchantName
        self.address = address
        self.timeZone = timeZone
        self.purchasedOn = purchasedOn
        self.purchasedAt = purchasedAt
        self.currency = currency
        self.total = total
        self.tax = tax
        self.discounts = discounts
        self.surcharges = surcharges
        self.shipping = shipping
        self.lines = lines
        self.unreadableNotes = unreadableNotes
    }
}
