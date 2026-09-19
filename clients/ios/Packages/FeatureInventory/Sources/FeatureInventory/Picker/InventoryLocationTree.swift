import AppCore
import Foundation

/// How many places, containers and items something amounts to.
internal struct InventoryPlaceTally: Equatable {
    internal var places = 0
    internal var containers = 0
    internal var items = 0

    internal var isEmpty: Bool { places + containers + items == 0 }

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
/// the placement picker alike, read from one replica state
/// (`InventoryLocationTree+Reading.swift`).
///
/// Children keep the order they were recorded in, which is the order a
/// person set them up in. A tally is everything at a place and below it,
/// including what is inside containers: what a row's numbers mean, never what
/// "directly here" means. A reparent is never offered the place's own
/// subtree, which would make a cycle.
internal struct InventoryLocationTree: Equatable {
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

    /// Every place below `id`, depth first. A parent chain that loops back on
    /// itself is corrupt data; it is walked once rather than forever.
    internal func descendants(of id: String) -> [InventoryLocationNode] {
        var seen: Set<String> = [id]
        return walk(below: id, seen: &seen)
    }

    private func walk(below id: String, seen: inout Set<String>) -> [InventoryLocationNode] {
        var found: [InventoryLocationNode] = []
        for child in children(of: id) where seen.insert(child.id).inserted {
            found.append(child)
            found += walk(below: child.id, seen: &seen)
        }
        return found
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

    /// Where the place `id` may move: anywhere but itself and the places
    /// inside it, either of which would make it its own ancestor.
    internal func reparentTargets(for id: String) -> Set<String> {
        Set(nodes.map(\.id)).subtracting([id] + descendants(of: id).map(\.id))
    }

    /// What deleting `id` does to what is in it, by `AppCore`'s one rule;
    /// nil for a place this tree does not hold.
    internal func deletion(of id: String) -> InventoryLocationDeletion? {
        guard let target = node(id) else { return nil }
        return InventoryLocationDeletion(
            name: target.name, parentName: target.parentID.flatMap { node($0)?.name },
            childPlaces: children(of: id).count, directContainers: target.directContainerCount,
            directItems: target.directItemCount)
    }

    internal func moveEffect(of id: String, to destinationID: String) -> String {
        guard let moving = node(id), let destination = node(destinationID) else { return "" }
        let below = descendants(of: id).count
        guard below > 0 else { return "\(moving.name) moves into \(destination.name)." }
        let places = InventoryPlaceTally(places: below).phrase
        return "\(moving.name) and \(places) move into \(destination.name)."
    }
}
