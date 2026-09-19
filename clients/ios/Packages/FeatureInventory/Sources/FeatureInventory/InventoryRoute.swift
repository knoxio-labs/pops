import AppCore

/// Every screen the Inventory stack can push, named inside this feature.
///
/// Feature-local rather than a case of `AppCore`'s `Route`, which is for
/// destinations one feature links to in another: nothing outside Inventory
/// opens these, and a label scanned elsewhere reaches them through the
/// composition root's entity router (ADR-002 D13), not through this enum.
internal enum InventoryRoute: Hashable, Sendable {
    case items
    case containers
    case locations
    case inHand
    case activity
    case syncRepair
    case scan
    case item(InventoryItem.ID)
    case container(InventoryItem.ID)
    case place(InventoryLocation.ID)

    /// Where a row for an item opens: a container's page when it is one, the
    /// item page otherwise (D1: both are items, but not the same screen).
    internal static func record(id: InventoryItem.ID, isContainer: Bool) -> InventoryRoute {
        isContainer ? .container(id) : .item(id)
    }
}
