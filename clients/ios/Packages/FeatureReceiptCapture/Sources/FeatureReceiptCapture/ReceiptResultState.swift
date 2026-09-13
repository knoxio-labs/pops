import AppCore

/// What the result screen is showing, as one value the view switches on
/// (POPS-2454).
///
/// Extraction and persistence are two different calls now, and this enum
/// says which half of that is in progress or done. ``draft(_:)`` is not
/// terminal the way ``ReceiptOutcome/created`` used to be: a reader edits it,
/// and only ``saved(_:)`` — reached through
/// ``ReceiptResultViewModel/save(_:)`` — means anything was written.
public enum ReceiptResultState: Hashable, Sendable {
    /// The parts are in flight to `extract`. Also what a retry after
    /// ``extractionFailed(_:)`` returns to — the receipt has not been read
    /// yet, either way.
    case extracting
    /// A usable reading, reconciled or not — see ``ReceiptDraftReading``.
    case draft(ReceiptDraftReading)
    /// A purchase typed by hand — no reading, so no receipt to compare
    /// against. Saves through
    /// ``ReceiptCaptureRepository/createManualPurchase(_:)``.
    case manualEntry
    /// Nothing usable came back. Terminal: there is nothing to edit.
    case unreadable(receiptCount: Int, reason: String)
    /// The extract call never got far enough to answer at all. Carries a
    /// retry — the same bytes, tried again — because nothing about this
    /// receipt is known to be wrong.
    case extractionFailed(RepositoryError)
    /// The draft was saved. What ``ReceiptPurchase`` this became.
    case saved(ReceiptPurchase)
}
