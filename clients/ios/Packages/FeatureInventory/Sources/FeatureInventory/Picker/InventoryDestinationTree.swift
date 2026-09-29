import Foundation

/// The destinations a placement picker can navigate, with locations and
/// containers sharing one parent/child hierarchy.
internal struct InventoryDestinationTree: Equatable {
    internal struct Node: Identifiable, Equatable {
        internal let destination: InventoryDestination
        internal let parentID: String?

        internal var id: String { destination.id }
        internal var isLocation: Bool { destination.kind == .location }

        internal init(destination: InventoryDestination, parentID: String?) {
            self.destination = destination
            self.parentID = parentID
        }
    }

    internal let locations: InventoryLocationTree
    internal let nodes: [Node]

    internal init(locations: InventoryLocationTree, extraNodes: [Node] = []) {
        let locationNodes = locations.nodes.map {
            Node(destination: InventoryDestination(place: $0, in: locations), parentID: $0.parentID)
        }
        self.init(locations: locations, nodes: locationNodes + extraNodes)
    }

    internal var roots: [Node] { children(of: nil) }

    internal func node(_ id: String) -> Node? {
        nodes.first { $0.id == id }
    }

    internal func children(of parentID: String?) -> [Node] {
        nodes.filter { $0.parentID == parentID }
    }

    internal func drillID(for nodeID: String, at levelID: String?) -> String? {
        guard nodeID != levelID, !children(of: nodeID).isEmpty else { return nil }
        return nodeID
    }

    internal func descendants(of id: String) -> [Node] {
        var seen: Set<String> = [id]
        return walk(below: id, seen: &seen)
    }

    internal var ordered: [Node] {
        roots.flatMap { [$0] + descendants(of: $0.id) }
    }

    internal func matching(_ query: String) -> [Node] {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return [] }
        return ordered.filter { $0.destination.name.localizedCaseInsensitiveContains(trimmed) }
    }

    private func walk(below id: String, seen: inout Set<String>) -> [Node] {
        var found: [Node] = []
        for child in children(of: id) where seen.insert(child.id).inserted {
            found.append(child)
            found += walk(below: child.id, seen: &seen)
        }
        return found
    }

    private init(locations: InventoryLocationTree, nodes: [Node]) {
        self.locations = locations
        self.nodes = nodes
    }

    internal func adding(_ newLocations: [InventoryLocationNode]) -> InventoryDestinationTree {
        guard !newLocations.isEmpty else { return self }
        let updatedLocations = InventoryLocationTree(nodes: locations.nodes + newLocations)
        let newNodes = newLocations.map {
            Node(
                destination: InventoryDestination(place: $0, in: updatedLocations),
                parentID: $0.parentID)
        }
        return InventoryDestinationTree(
            locations: updatedLocations, nodes: nodes + newNodes)
    }
}
