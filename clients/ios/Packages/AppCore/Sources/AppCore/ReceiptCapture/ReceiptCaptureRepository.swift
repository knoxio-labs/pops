/// Turning a photographed, scanned or pasted receipt into a purchase, as the
/// feature that captures it sees it.
public protocol ReceiptCaptureRepository: Sendable {
    /// - Parameter parts: one receipt, in order, top to bottom — mirrors the
    ///   BFM contract's `parts` array. Several frames of one piece of paper
    ///   are one receipt and one call, never several.
    /// - Returns: which of the three outcomes the read produced.
    /// - Throws: ``RepositoryError``, for a failure the read never got far
    ///   enough to answer with an outcome — the BFM unreachable, the session
    ///   revoked, or a response this build's contract cannot read.
    func capture(_ parts: [ReceiptPart]) async throws -> ReceiptOutcome
}
