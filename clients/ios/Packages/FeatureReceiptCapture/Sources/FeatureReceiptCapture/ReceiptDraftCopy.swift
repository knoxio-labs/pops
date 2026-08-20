/// Every word the correction form shows.
///
/// Its own set rather than an extension of ``ReceiptResultCopy``, because the
/// two screens address the reader differently. That one reports what happened
/// to a receipt; this one asks them to look at something and offers to take
/// what they say about it. Nothing here is phrased as a refusal or a rescue —
/// most people who open this screen are here because a till printed
/// `ZCHEETOS C&B BALLS` and they would like it to say what it is.
internal enum ReceiptDraftCopy {
    /// The screen's own name. Not "Fix this receipt": the common case is a
    /// reading that is already right, and telling somebody to fix something
    /// that is correct is how a confirmation becomes an interrogation.
    internal static let title = "Check this receipt"
    internal static let subtitle =
        "Everything read off the paper is here and every line can be changed. "
        + "Rename anything that isn't how you'd say it."

    /// The same screen with nothing read into it.
    internal static let manualTitle = "Add a purchase"
    internal static let manualSubtitle =
        "For something with no receipt to photograph. Fill in what you know."

    internal static let save = "Save purchase"

    // MARK: sections

    internal static let identitySection = "Who and when"
    internal static let itemsSection = "Items"
    internal static let totalsSection = "What it came to"

    // MARK: fields

    internal static let merchantLabel = ReceiptResultCopy.FieldLabel.merchant
    internal static let merchantPlaceholder = "Who you bought from"
    internal static let addressLabel = ReceiptResultCopy.FieldLabel.address
    internal static let addressPlaceholder = "Where the shop is"
    internal static let dateLabel = ReceiptResultCopy.FieldLabel.date
    /// Deliberately not a format. The value is a transcription of what the
    /// paper printed, and a placeholder reading `YYYY-MM-DD` would invite the
    /// reader to convert a date the receipt stated some other way.
    internal static let datePlaceholder = "As printed on the receipt"
    internal static let totalLabel = ReceiptResultCopy.FieldLabel.total
    internal static let amountPlaceholder = "0.00"

    internal static let itemDescriptionPlaceholder = "What it was"
    internal static let itemQuantityLabel = "Qty"
    internal static let itemQuantityPlaceholder = "—"
    internal static let itemUnitNotePlaceholder = "Unit price or weight"
    internal static let addItem = "Add an item"

    /// Named after what it removes rather than after the gesture, so
    /// VoiceOver says which row is about to go.
    internal static func removeItem(_ description: String) -> String {
        description.isEmpty ? "Remove this item" : "Remove \(description)"
    }

    /// The number of items, said once above the column so the reader can
    /// check the count against the paper without counting rows.
    internal static func itemCount(_ count: Int) -> String {
        count == 1 ? "1 item" : "\(count) items"
    }

    /// What an unnamed item is called before the reader names it. Neither a
    /// blank nor a fabricated name: the paper genuinely did not say, and the
    /// row still has an amount that has to be checkable.
    internal static let unnamedItem = "Unnamed item"

    // MARK: what the arithmetic is known to do

    /// Said when the gate checked the model's reading and it balanced. This
    /// is the reassurance that makes renaming three items safe: it tells the
    /// reader which figures they do not need to touch.
    internal static let reconciledAsRead = "As read, the items and the total agree."
    /// Said when it did not. Followed by the gate's own wording for the gap
    /// when it gave one.
    internal static let disputedAsRead = "As read, the items didn't add up to the total."
    /// Said once a figure has changed. The check was of numbers that are no
    /// longer on screen, and repeating it would be this screen vouching for
    /// arithmetic nobody has done.
    internal static let notRechecked = "The figures have changed since they were checked."

    // MARK: problems

    internal static let totalMissing = "A total is needed before this can be saved."
    internal static let lineAmountMissing = "An amount is needed, or remove the line."

    /// The gate's complaints that name no field, kept as one line under the
    /// heading rather than pinned to a field they are not about.
    internal static let generalHintsLabel = "About the paper itself"
}
