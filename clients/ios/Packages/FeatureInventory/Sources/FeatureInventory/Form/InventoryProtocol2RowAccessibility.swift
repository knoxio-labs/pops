/// The VoiceOver strings for a protocol-2 field row, built the same way
/// `TransactionPresentation.accessibilityLabel` is: a pure function over the
/// row's own facts, so a test can assert the sentence without rendering a
/// view. A many-valued field's entries and their move/remove controls are
/// otherwise unlabelled beyond "Value 2" and a bare glyph, which reads as
/// nothing useful once the visual position they rely on is gone.
internal enum InventoryProtocol2RowAccessibility {
    /// One entry of a many-valued field, said with its position among the
    /// others rather than just "Value 2": VoiceOver users cannot see that
    /// there are three, so a raw index would sound like a serial number
    /// rather than a place in a sequence.
    internal static func entryValue(fieldLabel: String, index: Int, count: Int) -> String {
        "\(fieldLabel), value \(index + 1) of \(count)"
    }

    internal static func addEntry(fieldLabel: String) -> String {
        "Add \(fieldLabel) value"
    }

    internal static func moveEarlier(fieldLabel: String, index: Int) -> String {
        "Move \(fieldLabel) value \(index + 1) earlier"
    }

    internal static func moveLater(fieldLabel: String, index: Int) -> String {
        "Move \(fieldLabel) value \(index + 1) later"
    }

    internal static func removeEntry(fieldLabel: String, index: Int) -> String {
        "Remove \(fieldLabel) value \(index + 1)"
    }

    /// A computed field's row: its current text is the value half of the
    /// label already (`computedValue` combines the row's children), but that
    /// combine only works once every child carries something to combine —
    /// this is what feeds it, and what a test can check without one.
    internal static func computed(fieldLabel: String, valueText: String, caption: String?) -> String
    {
        guard let caption, !caption.isEmpty else { return "\(fieldLabel), \(valueText)" }
        return "\(fieldLabel), \(valueText), \(caption)"
    }
}
