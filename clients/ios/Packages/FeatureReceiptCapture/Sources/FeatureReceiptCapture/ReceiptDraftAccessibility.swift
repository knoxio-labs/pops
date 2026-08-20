/// The handles the correction form offers to something driving it from
/// outside the process.
///
/// Same split ``ReceiptResultAccessibility`` draws, and the same reason for
/// it: these are stable names that survive a copy edit, not what VoiceOver
/// reads. It matters here because the fields differ from each other only by
/// their labels, and a flow keying on label text cannot tell a merchant from
/// an address once either is renamed.
///
/// Hyphens rather than dots, matching the sets next door.
internal enum ReceiptDraftAccessibility {
    /// The screen itself, so a flow can tell the form from the read-only
    /// reading it replaced.
    internal static let form = "receipt-draft-form"
    internal static let merchant = "receipt-draft-merchant"
    internal static let address = "receipt-draft-address"
    internal static let date = "receipt-draft-date"
    internal static let total = "receipt-draft-total"
    /// One line's two fields. Repeated per row on purpose: a driver reaches a
    /// specific row by its position in the collection, and minting an
    /// identifier per index would make the set depend on how many items the
    /// receipt happened to print.
    internal static let itemDescription = "receipt-draft-item-description"
    internal static let itemAmount = "receipt-draft-item-amount"
    internal static let removeItem = "receipt-draft-item-remove"
    internal static let addItem = "receipt-draft-add-item"
    /// What the screen says about whether the figures agree.
    internal static let reconciliation = "receipt-draft-reconciliation"
    internal static let saveButton = "receipt-draft-save"
}
