import Foundation

/// What kind of place a location is, which only decides its glyph and its
/// label. Any kind can be a root: a home, a car, a storage unit and someone
/// else's house are all top-level places without any of them being special.
internal enum InventoryPlaceKind: String, CaseIterable, Identifiable {
    case home
    case room
    case cupboard
    case shelf
    case drawer
    case vehicle
    case storage
    case elsewhere
    case outdoor

    internal var id: String { rawValue }

    internal var title: String {
        switch self {
        case .home: "Home"
        case .room: "Room"
        case .cupboard: "Cupboard"
        case .shelf: "Shelf"
        case .drawer: "Drawer"
        case .vehicle: "Vehicle"
        case .storage: "Storage"
        case .elsewhere: "Other home"
        case .outdoor: "Outdoor"
        }
    }

    internal var symbol: String {
        switch self {
        case .home: "house"
        case .room: "door.left.hand.open"
        case .cupboard: "cabinet"
        case .shelf: "books.vertical"
        case .drawer: "tray.2"
        case .vehicle: "car"
        case .storage: "building.2"
        case .elsewhere: "person.2"
        case .outdoor: "tree"
        }
    }
}

/// One thing sitting somewhere: an item, in the words the dashboard rows use.
internal struct InventoryPlacedEntry: Identifiable, Equatable {
    internal let id: String
    internal let name: String
    internal let typeName: String
    internal let symbol: String
    internal let quantity: Int

    internal init(
        id: String, name: String, typeName: String, symbol: String = "cube", quantity: Int = 1
    ) {
        self.id = id
        self.name = name
        self.typeName = typeName
        self.symbol = symbol
        self.quantity = quantity
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

    internal init(
        id: String, name: String, isOpen: Bool = false, contents: [InventoryPlacedEntry] = []
    ) {
        self.id = id
        self.name = name
        self.isOpen = isOpen
        self.contents = contents
    }

    internal var symbol: String {
        isOpen ? InventorySymbol.openContainer.system : InventorySymbol.closedContainer.system
    }
}

/// One place: a room, a shelf, a drawer. Not an item (ADR-001): no type, no
/// code, no lifecycle, only a name, a kind, a parent and what sits in it.
/// Flat rather than nested, so a tree fixture is one array.
internal struct InventoryLocationNode: Identifiable, Equatable {
    internal let id: String
    internal let name: String
    internal let kind: InventoryPlaceKind
    internal let parentID: String?
    internal let items: [InventoryPlacedEntry]
    internal let containers: [InventoryPlacedContainer]

    internal init(
        id: String,
        name: String,
        kind: InventoryPlaceKind = .room,
        parentID: String? = nil,
        items: [InventoryPlacedEntry] = [],
        containers: [InventoryPlacedContainer] = []
    ) {
        self.id = id
        self.name = name
        self.kind = kind
        self.parentID = parentID
        self.items = items
        self.containers = containers
    }

    internal var directItemCount: Int { items.count }
    internal var directContainerCount: Int { containers.count }
    internal var containedItemCount: Int { containers.reduce(0) { $0 + $1.contents.count } }
    internal var isEmpty: Bool { items.isEmpty && containers.isEmpty }
}

/// How many places, containers and items something amounts to.
internal struct InventoryPlaceTally: Equatable {
    internal var places = 0
    internal var containers = 0
    internal var items = 0

    internal var isEmpty: Bool { places + containers + items == 0 }

    internal var isSingular: Bool { places + containers + items == 1 }

    internal var summary: String {
        parts.joined(separator: " · ")
    }

    internal var phrase: String {
        guard let last = parts.last else { return "" }
        let head = parts.dropLast()
        return head.isEmpty ? last : head.joined(separator: ", ") + " and " + last
    }

    private var parts: [String] {
        [
            Self.count(places, "place", "places"),
            Self.count(containers, "container", "containers"),
            Self.count(items, "item", "items"),
        ].compactMap(\.self)
    }

    private static func count(_ value: Int, _ one: String, _ many: String) -> String? {
        value == 0 ? nil : "\(value) \(value == 1 ? one : many)"
    }
}

/// A hierarchy as a flat lookup, walked by the browser, the location page and
/// the placement picker alike.
///
/// Children keep the order they were recorded in, which is the order a
/// person set them up in. A tally is everything at a place and below it,
/// including what is inside containers: what a row's numbers mean, never what
/// "directly here" means. A reparent is never offered the place's own
/// subtree, which would make a cycle.
internal struct InventoryLocationTree {
    internal let nodes: [InventoryLocationNode]

    internal func node(_ id: String) -> InventoryLocationNode? {
        nodes.first { $0.id == id }
    }

    internal func children(of parentID: String?) -> [InventoryLocationNode] {
        nodes.filter { $0.parentID == parentID }
    }

    internal var roots: [InventoryLocationNode] { children(of: nil) }

    internal func breadcrumbs(for id: String) -> [InventoryLocationNode] {
        var trail: [InventoryLocationNode] = []
        var current = node(id)
        while let found = current, !trail.contains(where: { $0.id == found.id }) {
            trail.append(found)
            current = found.parentID.flatMap { node($0) }
        }
        return trail.reversed()
    }

    internal func parentPath(of id: String) -> String {
        breadcrumbs(for: id).dropLast().map(\.name).joined(separator: " › ")
    }

    internal func descendants(of id: String) -> [InventoryLocationNode] {
        children(of: id).flatMap { [$0] + descendants(of: $0.id) }
    }

    internal func isDescendant(_ id: String, of ancestorID: String) -> Bool {
        id == ancestorID || descendants(of: ancestorID).contains { $0.id == id }
    }

    internal func tally(of id: String) -> InventoryPlaceTally {
        guard let root = node(id) else { return InventoryPlaceTally() }
        let below = descendants(of: id)
        return ([root] + below).reduce(into: InventoryPlaceTally(places: below.count)) {
            $0.containers += $1.directContainerCount
            $0.items += $1.directItemCount + $1.containedItemCount
        }
    }

    internal var total: InventoryPlaceTally {
        nodes.reduce(into: InventoryPlaceTally(places: nodes.count)) {
            $0.containers += $1.directContainerCount
            $0.items += $1.directItemCount + $1.containedItemCount
        }
    }

    internal func matching(_ query: String) -> [InventoryLocationNode] {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return [] }
        return ordered.filter { $0.name.localizedCaseInsensitiveContains(trimmed) }
    }

    internal var ordered: [InventoryLocationNode] {
        roots.flatMap { [$0] + descendants(of: $0.id) }
    }

    internal func reparentTargets(for id: String) -> Set<String> {
        Set(nodes.map(\.id)).subtracting([id] + descendants(of: id).map(\.id))
    }

    internal func deletionEffect(of id: String) -> String {
        guard let target = node(id) else { return "" }
        let moving = InventoryPlaceTally(
            places: children(of: id).count,
            containers: target.directContainerCount,
            items: target.directItemCount + target.containedItemCount)
        guard !moving.isEmpty else { return "Only \(target.name) is removed." }
        let destination = target.parentID.flatMap { node($0)?.name }
        guard let destination else {
            return "\(moving.phrase) \(moving.isSingular ? "loses its" : "lose their") place."
        }
        return "\(moving.phrase) \(moving.isSingular ? "moves" : "move") to \(destination)."
    }

    internal func moveEffect(of id: String, to destinationID: String) -> String {
        guard let moving = node(id), let destination = node(destinationID) else { return "" }
        let below = descendants(of: id).count
        guard below > 0 else { return "\(moving.name) moves into \(destination.name)." }
        let places = InventoryPlaceTally(places: below).phrase
        return "\(moving.name) and \(places) move into \(destination.name)."
    }
}
