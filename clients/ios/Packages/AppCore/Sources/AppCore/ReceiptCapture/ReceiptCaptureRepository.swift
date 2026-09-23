/// Turning a photographed, scanned or pasted receipt into a purchase, and
/// creating one with no receipt at all — as the feature that captures it
/// sees it (POPS-2454).
///
/// Extraction and persistence are two calls, deliberately: ``extract(_:)``
/// reads a receipt and answers something to edit, and never writes a
/// purchase. ``saveDraft(_:)`` writes one, from whatever the reader
/// confirmed or corrected. ``createManualPurchase(_:)`` writes one with no
/// receipt behind it at all. The old single-call ``capture(_:)`` — read and
/// persist in one request — is retired: a reconciled reading used to become
/// a purchase before anyone saw it, which left no room to correct anything.
public protocol ReceiptCaptureRepository: Sendable {
    /// - Parameter parts: one receipt, in order, top to bottom — mirrors the
    ///   BFM contract's `parts` array. Several frames of one piece of paper
    ///   are one receipt and one call, never several.
    /// - Returns: a draft to edit, or a report that nothing usable came back.
    /// - Throws: ``RepositoryError``, for a failure the read never got far
    ///   enough to answer at all — the BFM unreachable, the session revoked,
    ///   or a response this build's contract cannot read.
    func extract(_ parts: [ReceiptPart]) async throws -> ReceiptExtraction

    /// Persists a reviewed, possibly corrected receipt-derived draft.
    ///
    /// Repeating a payload's idempotency key returns the purchase that key
    /// already created without writing a second purchase. A caller therefore
    /// retains the key while retrying one uncertain save and mints a new key
    /// only for a new intended purchase.
    ///
    /// - Throws: ``RepositoryError`` when persistence cannot return a purchase.
    func saveDraft(_ payload: ReceiptDraftSavePayload) async throws -> ReceiptPurchase

    /// Persists a purchase typed by hand — no receipt, no photograph.
    ///
    /// Repeating a payload's idempotency key returns the purchase that key
    /// already created without writing a second purchase. A caller therefore
    /// retains the key while retrying one uncertain save and mints a new key
    /// only for a new intended purchase.
    func createManualPurchase(_ payload: ReceiptManualPurchasePayload) async throws
        -> ReceiptPurchase
}
