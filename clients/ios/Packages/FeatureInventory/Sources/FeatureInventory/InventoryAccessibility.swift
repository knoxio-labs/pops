/// The handles Inventory's screens offer to something driving them from
/// outside the process, for the reason `TransactionsAccessibility` gives:
/// stable names that survive a copy edit.
/// `clients/ios/.maestro/inventory-smoke.yaml` keys on them.
///
/// Only where text cannot find the control: everything else in that flow is
/// reached by the words on screen.
internal enum InventoryAccessibility {
    /// The item form's name field, whose label and placeholder both read
    /// "Name".
    internal static let itemNameField = "inventory-item-name-field"
    internal static let useFreeCode = "inventory-item-use-free-code"

    /// The item form's Type picker. Its label reads "Type, <current type>",
    /// which changes with every choice, so a driver addresses it by this.
    internal static let itemTypePicker = "inventory-item-type"
    internal static let itemTypeNone = "inventory-item-type-option-none"

    /// One option of the Type picker, by the catalogue type's own stable id
    /// (a protocol-1 catalogue's type key). A type's label is owner-authored
    /// and two types may share one, so only the id names a single option.
    internal static func itemTypeOption(id: String) -> String {
        "inventory-item-type-option-\(id)"
    }

    /// One option in a choice field's pushed list, by the option's stable id
    /// (a protocol-1 choice's own value).
    internal static func choiceOption(fieldId: String, optionId: String) -> String {
        "inventory-field-\(fieldId)-option-\(optionId)"
    }

    /// The row in a choice field's pushed list that clears its value.
    internal static func choiceClear(fieldId: String) -> String {
        "inventory-field-\(fieldId)-clear"
    }

    /// A protocol-2 field's scalar editor, by the catalogue field's own
    /// stable id. A field's label is user-authored and, for a computed
    /// field's `LabeledContent`, combined with its current value into one
    /// accessibility element — neither is a label a driver can address a tap
    /// to reliably; the row beside it can hold a keyboard focus a
    /// mis-resolved tap leaves untouched, and the value then lands wherever
    /// focus already was.
    internal static func protocol2Field(id: String) -> String {
        "inventory-field-\(id)"
    }

    /// A many-valued field's Nth entry, addressed by its position in the
    /// list rather than the entry's own (ephemeral, UI-only) id: a driver
    /// script knows the field id from the catalogue it seeded, but never the
    /// entry id the form invents when "Add" is tapped. Sharing
    /// ``protocol2Field(id:)``'s own string would collide every entry of a
    /// many-valued field onto the one identifier that scalar field already
    /// owns, so this is a distinct namespace, suffixed rather than nested.
    internal static func protocol2FieldEntry(id: String, index: Int) -> String {
        "inventory-field-\(id)-\(index)"
    }

    /// The button that appends one more entry to a many-valued field.
    internal static func protocol2FieldAdd(id: String) -> String {
        "inventory-field-\(id)-add"
    }

    /// The drag handle for reordering a many-valued field's entry at `index`.
    internal static func protocol2FieldReorder(id: String, index: Int) -> String {
        "inventory-field-\(id)-\(index)-reorder"
    }

    /// The trailing swipe action that removes the entry at `index`.
    internal static func protocol2FieldRemove(id: String, index: Int) -> String {
        "inventory-field-\(id)-\(index)-remove"
    }
}
