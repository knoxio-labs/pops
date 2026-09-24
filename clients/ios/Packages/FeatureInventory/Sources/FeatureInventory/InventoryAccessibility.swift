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
}
