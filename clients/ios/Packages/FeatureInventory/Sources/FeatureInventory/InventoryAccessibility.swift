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
}
