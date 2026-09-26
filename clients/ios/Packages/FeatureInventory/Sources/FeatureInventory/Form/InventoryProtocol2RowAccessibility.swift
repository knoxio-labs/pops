/// The VoiceOver strings for a protocol-2 field row, kept separate from the
/// view so the labels remain stable while the visual row loses its repeated
/// titles.
internal enum InventoryProtocol2RowAccessibility {
    internal static func entryValue(fieldLabel: String, index: Int, count: Int) -> String {
        count == 1 ? fieldLabel : "\(fieldLabel) \(index + 1)"
    }

    internal static func addEntry(fieldLabel: String) -> String {
        "Add \(fieldLabel)"
    }

    internal static func reorderHandle(fieldLabel: String, index: Int, count: Int) -> String {
        count == 1 ? "Reorder \(fieldLabel)" : "Reorder \(fieldLabel) \(index + 1)"
    }

    internal static func removeEntry(fieldLabel: String, index: Int, count: Int) -> String {
        count == 1 ? "Delete \(fieldLabel)" : "Delete \(fieldLabel) \(index + 1)"
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
