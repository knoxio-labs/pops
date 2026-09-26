import AppCore

/// Where a field's help reaches a typed editor: as the words an empty field
/// shows, and blank when the field has none.
internal enum InventoryProtocol2FieldHint {
    internal static func placeholder(for field: InventoryCatalogueField) -> String {
        placeholder(for: field, showsLabel: true)
    }

    internal static func placeholder(
        for field: InventoryCatalogueField, showsLabel: Bool
    ) -> String {
        guard showsLabel else { return InventoryFormBlank.placeholder }
        return field.help ?? InventoryFormBlank.placeholder
    }
}

internal enum InventoryProtocol2EnumOptions {
    internal static func selectable(
        for field: InventoryCatalogueField, retaining selectedId: String?
    ) -> [InventoryCatalogueOption] {
        field.enumOptions.filter { $0.archivedAt == nil || $0.id == selectedId }
            .sorted { ($0.sortOrder, $0.id) < ($1.sortOrder, $1.id) }
    }

    /// ``selectable(for:retaining:)`` as the rows of the field's pushed list.
    internal static func choices(
        for field: InventoryCatalogueField, retaining selectedId: String?
    ) -> [InventoryFormChoiceOption] {
        selectable(for: field, retaining: selectedId).map {
            InventoryFormChoiceOption(id: $0.id, label: label(of: $0))
        }
    }

    /// An option's words, marked when the catalogue has retired it: a value
    /// already holding one still reads, and says why it is on its way out.
    internal static func label(of option: InventoryCatalogueOption) -> String {
        option.archivedAt == nil ? option.label : "\(option.label) (Retired)"
    }
}
