/// The handles the result screen offers to something driving it from outside
/// the process.
///
/// Same split ``ReceiptCaptureAccessibility`` draws for the capture screen:
/// this is not what VoiceOver reads, it is a stable name that survives a
/// copy edit and a localisation. It matters more here than there — `created`,
/// `needsReview` and `unreadable` differ from each other only by copy, so a
/// flow keying on label text cannot tell them apart, and that is exactly the
/// failure this exists to prevent.
///
/// Hyphens rather than dots, for the reason ``ReceiptCaptureAccessibility``
/// documents.
internal enum ReceiptResultAccessibility {
    /// The call is in flight, or a retry has just been pressed.
    internal static let submitting = "receipt-result-submitting"
    /// The gateway-failure retry control — the only affordance in this
    /// screen that resends the same bytes rather than starting a new scan.
    internal static let retryButton = "receipt-result-retry"
    internal static let created = "receipt-result-created"
    internal static let needsReview = "receipt-result-needs-review"
    internal static let unreadable = "receipt-result-unreadable"
}
