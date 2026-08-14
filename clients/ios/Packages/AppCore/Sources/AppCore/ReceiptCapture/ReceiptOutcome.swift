/// What reading an uploaded receipt produced.
///
/// A real tri-state rather than a boolean success/failure, or an optional
/// purchase: a model reading a crumpled receipt produces three materially
/// different outcomes, and collapsing any two of them loses the distinction
/// the whole feature rests on. A reading that agreed with the receipt is a
/// fact; a reading that did not is a real purchase needing a human; a reading
/// that produced nothing usable is neither.
public enum ReceiptOutcome: Hashable, Sendable {
    /// The purchase was written. ``alreadyStored`` is `true` when these exact
    /// bytes were already on file — a re-upload of the same receipt, not a
    /// duplicate purchase.
    case created(purchaseId: String, alreadyStored: Bool)

    /// Read, but the figures disagree with the total the receipt states. A
    /// real purchase a human has to settle, with everything the model saw so
    /// the reviewer can compare it against the photograph. Nothing is
    /// written.
    case needsReview(
        receiptURIs: [String], failures: [ReceiptGateFailure], extracted: ExtractedReceipt)

    /// Nothing usable came back. Not a purchase, and not an empty receipt.
    case unreadable(receiptURIs: [String], reason: String)
}
