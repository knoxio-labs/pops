import AppCore

/// What the form reads from the store, as one query: the catalogue its type
/// picker and field rows are built from, whether the replica is offline (the
/// code assist's offline state), and, when editing, the item as it stands.
internal struct InventoryItemFormContext: Equatable, Sendable {
    internal let catalogue: InventoryCatalogue
    internal let isOffline: Bool
    /// The item being edited; nil for a create, and for an edit whose item
    /// has gone.
    internal let item: InventoryItem?
    /// The name of where the item is (edit) or where it was opened from
    /// (create).
    internal let placementName: String?

    internal static func query(
        for request: InventoryItemFormRequest
    ) -> InventoryQuery<InventoryItemFormContext> {
        InventoryQuery { source in
            let item: InventoryItem?
            let placement: InventoryPlacement?
            switch request {
            case .create(let origin):
                item = nil
                placement = origin
            case .edit(let id):
                item = source.inventoryItem(id: id).flatMap { $0.isDeleted ? nil : $0 }
                placement = item?.placement
            }
            let isOffline: Bool
            if case .offline = source.inventoryReplicaStatus() {
                isOffline = true
            } else {
                isOffline = false
            }
            return InventoryItemFormContext(
                catalogue: source.inventoryCatalogue(), isOffline: isOffline, item: item,
                placementName: placement.flatMap { name(of: $0, in: source) })
        }
    }

    /// The item already wearing `code`, other than the one being entered.
    ///
    /// Read through the replica's search, which covers codes, then held to an
    /// exact case-insensitive match: the server's unique index on codes is
    /// case-insensitive too, so "b412" is taken when "B412" is.
    internal static func holder(
        of code: String, excluding itemId: InventoryItem.ID
    ) -> InventoryQuery<InventoryItem?> {
        InventoryQuery { source in
            source.inventorySearch(text: code, includeInactive: true).first {
                $0.id != itemId && $0.code?.caseInsensitiveCompare(code) == .orderedSame
            }
        }
    }

    private static func name(
        of placement: InventoryPlacement, in source: any InventoryQuerySource
    ) -> String? {
        switch placement {
        case .location(let id): source.inventoryLocation(id: id)?.name
        case .container(let id): source.inventoryItem(id: id)?.name
        case .hand: nil
        }
    }
}
