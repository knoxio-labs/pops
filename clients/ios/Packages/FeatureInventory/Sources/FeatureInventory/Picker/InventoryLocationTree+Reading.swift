import AppCore

/// One thing sitting somewhere, in the words the dashboard rows use.
internal struct InventoryPlacedEntry: Identifiable, Equatable {
    internal let id: String
    internal let name: String
    /// The type's name, or "No type yet" for an item filed before its type.
    internal let typeName: String
    internal let symbol: String
    internal let quantity: Int

    internal init(item: InventoryItem, catalogue: InventoryCatalogue) {
        id = item.id
        name = item.name
        typeName = item.typeKey.flatMap { catalogue.type(forKey: $0)?.name } ?? "No type yet"
        symbol = InventorySymbol.record(access: item.containment?.access).system
        quantity = item.quantity.count
    }
}

/// A container sitting directly in a place, with what is inside it. Its
/// contents are in the place only through it, which is the whole difference
/// between direct and effective placement.
internal struct InventoryPlacedContainer: Identifiable, Equatable {
    internal let id: String
    internal let name: String
    internal let isOpen: Bool
    internal let contents: [InventoryPlacedEntry]

    internal var symbol: String {
        isOpen ? InventorySymbol.openContainer.system : InventorySymbol.closedContainer.system
    }
}

/// One place: a room, a shelf, a drawer. Not an item: no type, no code, no
/// lifecycle, only a name, a parent and what sits in it. Flat rather than
/// nested, so a tree is one array.
internal struct InventoryLocationNode: Identifiable, Equatable {
    internal let id: String
    internal let name: String
    internal let parentID: String?
    internal let items: [InventoryPlacedEntry]
    internal let containers: [InventoryPlacedContainer]

    internal init(
        id: String, name: String, parentID: String? = nil,
        items: [InventoryPlacedEntry] = [], containers: [InventoryPlacedContainer] = []
    ) {
        self.id = id
        self.name = name
        self.parentID = parentID
        self.items = items
        self.containers = containers
    }

    internal var directItemCount: Int { items.count }
    internal var directContainerCount: Int { containers.count }
    internal var containedItemCount: Int { containers.reduce(0) { $0 + $1.contents.count } }
    internal var isEmpty: Bool { items.isEmpty && containers.isEmpty }
}

extension InventoryLocationTree {
    /// Every live place, in recorded order, with what sits directly in each:
    /// active items and containers whose own placement names the place, and
    /// each container's active contents. Inactive and deleted records are
    /// left out of every list and count, as they are everywhere else.
    internal init(reading source: any InventoryQuerySource) {
        let catalogue = source.inventoryCatalogue()
        nodes = source.inventoryLocationTree().filter { !$0.isDeleted }.map { location in
            let here = source.inventoryContents(ofLocation: location.id).filter {
                $0.placement == .location(location.id) && $0.isLive
            }
            return InventoryLocationNode(
                id: location.id, name: location.name, parentID: location.parentId,
                items: here.filter { !$0.isContainer }.map {
                    InventoryPlacedEntry(item: $0, catalogue: catalogue)
                },
                containers: here.filter(\.isContainer).map { container in
                    InventoryPlacedContainer(
                        id: container.id, name: container.name,
                        isOpen: container.containment?.access == .open,
                        contents: source.inventoryContents(ofContainer: container.id)
                            .filter(\.isLive)
                            .map { InventoryPlacedEntry(item: $0, catalogue: catalogue) })
                })
        }
    }
}

extension InventoryItem {
    /// Counts and lists show only what is still part of "what I have".
    internal var isLive: Bool { lifecycle == .active && !isDeleted }
}
