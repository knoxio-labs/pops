import AppCore

/// The names on the way to where something is, read from one replica state:
/// the location path from the top level down, then every container from the
/// outermost in. What a placement path, a Put back row and a container's
/// page all print.
internal struct InventoryPlacementCrumbs {
    /// The server's containment cycle guard, applied to the walk on this side
    /// too: a chain longer than the server would ever store is corrupt data,
    /// and stopping beats spinning.
    private static let maximumDepth = 32

    internal let source: any InventoryQuerySource

    internal func names(of placement: InventoryPlacement) -> [String] {
        var containers: [String] = []
        var current = placement
        for _ in 0..<Self.maximumDepth {
            switch current {
            case .hand:
                return containers.reversed()
            case .location(let id):
                return locationPath(id) + containers.reversed()
            case .container(let id):
                guard let container = source.inventoryItem(id: id), !container.isDeleted
                else { return containers.reversed() }
                containers.append(container.name)
                current = container.placement
            }
        }
        return containers.reversed()
    }

    /// Every live place from the top level down to `id`, `id` last.
    internal func locationPath(_ id: InventoryLocation.ID) -> [String] {
        var path: [String] = []
        var next: InventoryLocation.ID? = id
        for _ in 0..<Self.maximumDepth {
            guard let current = next, let location = source.inventoryLocation(id: current),
                !location.isDeleted
            else { break }
            path.append(location.name)
            next = location.parentId
        }
        return path.reversed()
    }

    /// The containers an item may not be put into: itself, when it is one,
    /// and every container anywhere inside it. Either would make a placement
    /// chain that never reaches a place.
    internal func blockedContainers(moving ids: Set<InventoryItem.ID>) -> Set<InventoryItem.ID> {
        let inside = source.inventoryContainers().filter { container in
            var current = container.placement
            for _ in 0..<Self.maximumDepth {
                guard case .container(let parent) = current else { return false }
                if ids.contains(parent) { return true }
                guard let next = source.inventoryItem(id: parent) else { return false }
                current = next.placement
            }
            return false
        }
        return ids.union(inside.map(\.id))
    }
}
