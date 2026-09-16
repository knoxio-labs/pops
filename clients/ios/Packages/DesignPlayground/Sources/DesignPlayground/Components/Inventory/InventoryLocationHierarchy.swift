/// The location hierarchy, and the ordering a destination chooser shows it in.
///
/// A location is not an item (ADR-001): no type, no code, no lifecycle, no
/// sync mark. What it has is a name, a parent, and what it holds, directly
/// and through the rooms and containers below it, which is what these types
/// exist to compute.

/// One place: a room, a shelf, a drawer. Flat rather than nested, so a
/// hundred-node fixture is one array instead of a tree literal nobody can
/// read.
internal struct InventoryLocationNode: Identifiable, Equatable {
    internal let id: String
    internal let name: String
    internal let parentID: String?
    internal let directItemCount: Int
    internal let directContainerCount: Int

    internal init(
        id: String,
        name: String,
        parentID: String? = nil,
        directItemCount: Int = 0,
        directContainerCount: Int = 0
    ) {
        self.id = id
        self.name = name
        self.parentID = parentID
        self.directItemCount = directItemCount
        self.directContainerCount = directContainerCount
    }
}

/// A hierarchy as a flat lookup, walked by the browser, the detail screen and
/// the destination chooser alike.
internal struct InventoryLocationTree {
    internal let nodes: [InventoryLocationNode]

    internal func node(_ id: String) -> InventoryLocationNode? {
        nodes.first { $0.id == id }
    }

    internal func children(of parentID: String?) -> [InventoryLocationNode] {
        nodes.filter { $0.parentID == parentID }.sorted { $0.name < $1.name }
    }

    internal var roots: [InventoryLocationNode] { children(of: nil) }

    /// Room to room, ending at `id`. Empty when `id` is unknown.
    internal func breadcrumbs(for id: String) -> [InventoryLocationNode] {
        var trail: [InventoryLocationNode] = []
        var current = node(id)
        while let found = current {
            trail.append(found)
            current = found.parentID.flatMap { node($0) }
        }
        return trail.reversed()
    }

    /// Every node below `id`, `id` itself excluded.
    internal func descendants(of id: String) -> [InventoryLocationNode] {
        children(of: id).flatMap { [$0] + descendants(of: $0.id) }
    }

    /// Direct counts plus everything the subtree below adds. What effective
    /// placement means for a location rather than an item: never shown as
    /// though it were direct.
    internal func effectiveItemCount(of id: String) -> Int {
        guard let root = node(id) else { return 0 }
        return root.directItemCount + descendants(of: id).reduce(0) { $0 + $1.directItemCount }
    }

    internal func effectiveContainerCount(of id: String) -> Int {
        guard let root = node(id) else { return 0 }
        return root.directContainerCount
            + descendants(of: id).reduce(0) { $0 + $1.directContainerCount }
    }

    /// Whether `id` is `ancestorID` or sits anywhere below it. A reparent and
    /// a destination chooser both need this: neither can be offered a target
    /// inside its own subtree without creating a cycle.
    internal func isDescendant(_ id: String, of ancestorID: String) -> Bool {
        id == ancestorID || descendants(of: ancestorID).contains { $0.id == id }
    }
}

/// One thing a mover could choose: a location, or an open container able to
/// receive an item.
internal struct InventoryDestinationOption: Identifiable, Equatable {
    internal enum Kind: CaseIterable, Equatable {
        case recentLocation, favoriteLocation, openContainer, location
    }

    internal let id: String
    internal let title: String
    internal let path: String
    internal let kind: Kind
}

/// Orders the options a destination picker shows: recent, then favourite,
/// then open containers, then every remaining location alphabetically, each
/// id kept only in its highest tier.
internal enum InventoryDestinationChooser {
    internal static func options(
        tree: InventoryLocationTree,
        recentIDs: [String] = [],
        favoriteIDs: [String] = [],
        openContainers: [(id: String, name: String)] = [],
        excluding excludedIDs: Set<String> = []
    ) -> [InventoryDestinationOption] {
        var accumulator = Accumulator(excludedIDs: excludedIDs)
        for id in recentIDs {
            accumulator.appendLocation(tree: tree, id: id, kind: .recentLocation)
        }
        for id in favoriteIDs {
            accumulator.appendLocation(tree: tree, id: id, kind: .favoriteLocation)
        }
        accumulator.appendContainers(openContainers)
        for node in tree.nodes.sorted(by: { $0.name < $1.name }) {
            accumulator.appendLocation(tree: tree, id: node.id, kind: .location)
        }
        return accumulator.options
    }

    /// The seen-ids guard and the options collected so far, together so no
    /// call site can update one without the other.
    private struct Accumulator {
        let excludedIDs: Set<String>
        var seen: Set<String> = []
        var options: [InventoryDestinationOption] = []

        mutating func appendLocation(
            tree: InventoryLocationTree, id: String, kind: InventoryDestinationOption.Kind
        ) {
            guard !excludedIDs.contains(id), seen.insert(id).inserted, let node = tree.node(id)
            else {
                return
            }
            let path = tree.breadcrumbs(for: id).map(\.name).joined(separator: " › ")
            options.append(
                InventoryDestinationOption(id: id, title: node.name, path: path, kind: kind))
        }

        mutating func appendContainers(_ containers: [(id: String, name: String)]) {
            for container in containers where seen.insert(container.id).inserted {
                options.append(
                    InventoryDestinationOption(
                        id: container.id, title: container.name, path: "Open container",
                        kind: .openContainer))
            }
        }
    }
}
