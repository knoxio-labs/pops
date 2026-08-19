/// The purchase a read receipt became, as a confirmation screen draws it.
///
/// Money is a ``MoneyAmount`` rather than the cents-and-code pair the wire
/// carries, so the one place that knows how many minor units a currency has is
/// the one place that formats it — the same type the transaction list holds,
/// for the same reason.
public struct ReceiptPurchase: Hashable, Sendable {
    public let id: String
    /// Merchant as the purchases pillar resolved it, or `nil` when it could
    /// not. `nil` is a resolution that failed, not a merchant named nothing.
    public let merchantName: String?
    public let total: MoneyAmount
    /// ISO-8601 with a timezone, as the producer serves it. Left as the string
    /// it arrived as rather than parsed into a `Date`: the receipt's own date
    /// is what this screen reports, and re-rendering it through a formatter is
    /// how a confirmation comes to state a day the paper never did.
    public let orderedAt: String
    /// Line items read off the receipt. What "12 items" is drawn from.
    public let itemCount: Int

    public init(
        id: String, merchantName: String?, total: MoneyAmount, orderedAt: String, itemCount: Int
    ) {
        self.id = id
        self.merchantName = merchantName
        self.total = total
        self.orderedAt = orderedAt
        self.itemCount = itemCount
    }
}

/// What reading an uploaded receipt produced.
///
/// A real tri-state rather than a boolean success/failure, or an optional
/// purchase: a model reading a crumpled receipt produces three materially
/// different outcomes, and collapsing any two of them loses the distinction
/// the whole feature rests on. A reading that agreed with the receipt is a
/// fact; a reading that did not is a real purchase needing a human; a reading
/// that produced nothing usable is neither.
///
/// Every case carries what its screen draws and nothing else. `receiptCount`
/// rather than the stored parts' URIs, because no mobile route serves those
/// bytes — a pointer the app cannot follow is not a smaller payload, it is a
/// field that can only ever be ignored.
public enum ReceiptOutcome: Hashable, Sendable {
    /// The purchase was written. ``alreadyStored`` is `true` when these exact
    /// bytes were already on file — a re-upload of the same receipt, not a
    /// duplicate purchase.
    case created(purchase: ReceiptPurchase, alreadyStored: Bool)

    /// Read, but the figures disagree with the total the receipt states. A
    /// real purchase a human has to settle, with everything the model saw so
    /// the reviewer can compare it against the photograph. Nothing is
    /// written.
    case needsReview(
        receiptCount: Int, failures: [ReceiptGateFailure], extracted: ExtractedReceipt)

    /// Nothing usable came back. Not a purchase, and not an empty receipt.
    case unreadable(receiptCount: Int, reason: String)
}
