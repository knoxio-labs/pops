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

    /// Moves the entry at `index` one place earlier. A plain button, not a
    /// menu item: `Menu`-hosted actions are the flaky control class
    /// automation already avoids for the Type picker (POPS-4556), and a
    /// many-valued field's reorder controls are exactly that same class if
    /// left inside one.
    internal static func protocol2FieldMoveEarlier(id: String, index: Int) -> String {
        "inventory-field-\(id)-\(index)-move-earlier"
    }

    /// Moves the entry at `index` one place later, the same reasoning as
    /// ``protocol2FieldMoveEarlier(id:index:)``.
    internal static func protocol2FieldMoveLater(id: String, index: Int) -> String {
        "inventory-field-\(id)-\(index)-move-later"
    }

    /// Removes the entry at `index`.
    internal static func protocol2FieldRemove(id: String, index: Int) -> String {
        "inventory-field-\(id)-\(index)-remove"
    }
}
