import AppCore
import Foundation

/// What the placement picker is placing, and how its commit bar reads.
internal struct InventoryPlacementRequest: Identifiable, Equatable {
    internal enum Subject: Equatable {
        /// One or more items, containers included.
        case items([InventoryItem.ID])
        /// A place, being given a new parent.
        case location(InventoryLocation.ID)
    }

    internal let id: String
    internal let subject: Subject
    /// The sheet's title: what is being placed, by name or by count.
    internal let title: String
    internal let commitTitle: String
    /// The verb a move records when the choice is not Put back.
    internal let verb: InventoryMoveVerb

    internal init(
        subject: Subject, title: String, commitTitle: String = "Move",
        verb: InventoryMoveVerb = .move, id: String = UUID().uuidString
    ) {
        self.id = id
        self.subject = subject
        self.title = title
        self.commitTitle = commitTitle
        self.verb = verb
    }
}

/// Everything the picker offers for one request, read from one replica
/// state.
///
/// For items: Put back when exactly one item is in hand with a place to go
/// back to, even a closed container; recent destinations; and one tree of
/// places and live containers. A container is never offered itself or
/// anything inside it. For a place: only the places it may move under.
internal struct InventoryPlacementChoices: Equatable {
    internal static let recentLimit = 3
    private static let recentScan = 20

    internal let tree: InventoryLocationTree
    internal let destinations: InventoryDestinationTree
    internal let putBack: InventoryDestination?
    internal let recent: [InventoryDestination]
    internal let offered: Set<String>?

    internal init(
        reading source: any InventoryQuerySource, for subject: InventoryPlacementRequest.Subject
    ) {
        let full = InventoryLocationTree(reading: source)
        let crumbs = InventoryPlacementCrumbs(source: source)
        switch subject {
        case .location(let id):
            tree = full
            destinations = InventoryDestinationTree(locations: full)
            putBack = nil
            recent = []
            offered = full.reparentTargets(for: id)
        case .items(let ids):
            let blocked = crumbs.blockedContainers(moving: Set(ids))
            tree = full.withoutContainers(blocked)
            destinations = InventoryDestinationTree(
                locations: tree,
                extraNodes: Self.containerNodes(
                    source: source, locations: tree, blocked: blocked))
            putBack = Self.putBack(ids, source: source, crumbs: crumbs)
            recent = Self.recent(moving: Set(ids), blocked: blocked, source: source, tree: tree)
            offered = nil
        }
    }

    private static func containerNodes(
        source: any InventoryQuerySource, locations: InventoryLocationTree,
        blocked: Set<InventoryItem.ID>
    ) -> [InventoryDestinationTree.Node] {
        let containers = source.inventoryContainers().filter {
            $0.isLive && !blocked.contains($0.id)
        }
        let available = Set(containers.map(\.id))
        let crumbs = InventoryPlacementCrumbs(source: source)
        return containers.map { container in
            let parentID: String?
            switch container.placement {
            case .location(let id):
                parentID = locations.node(id) == nil ? nil : id
            case .container(let id):
                parentID = available.contains(id) ? id : nil
            case .hand:
                parentID = nil
            }
            return InventoryDestinationTree.Node(
                destination: Self.destination(container: container, crumbs: crumbs, source: source),
                parentID: parentID)
        }
    }

    private static func putBack(
        _ ids: [InventoryItem.ID], source: any InventoryQuerySource,
        crumbs: InventoryPlacementCrumbs
    ) -> InventoryDestination? {
        guard ids.count == 1, let item = source.inventoryItem(id: ids[0]), item.placement == .hand
        else { return nil }
        let previous: InventoryPlacement
        switch item.previousPlacement {
        case .location(let id) where source.inventoryLocation(id: id)?.isDeleted == false:
            previous = .location(id)
        case .container(let id) where source.inventoryItem(id: id)?.isDeleted == false:
            previous = .container(id)
        default:
            return nil
        }
        return InventoryDestination(
            id: "put-back", name: "Put back", kind: .putBack(previous),
            detail: crumbs.names(of: previous).joined(separator: " › "))
    }

    private static func recent(
        moving ids: Set<InventoryItem.ID>, blocked: Set<InventoryItem.ID>,
        source: any InventoryQuerySource, tree: InventoryLocationTree
    ) -> [InventoryDestination] {
        var seen: Set<String> = []
        var found: [InventoryDestination] = []
        let crumbs = InventoryPlacementCrumbs(source: source)
        for item in source.inventoryRecents(limit: recentScan) where !ids.contains(item.id) {
            let destination: InventoryDestination?
            switch item.placement {
            case .location(let id):
                destination = tree.node(id).map { InventoryDestination(place: $0, in: tree) }
            case .container(let id) where !blocked.contains(id):
                destination = source.inventoryItem(id: id).flatMap {
                    $0.isLive
                        ? Self.destination(container: $0, crumbs: crumbs, source: source) : nil
                }
            case .container, .hand:
                destination = nil
            }
            guard let destination, seen.insert(destination.id).inserted else { continue }
            found.append(destination)
            if found.count == recentLimit { break }
        }
        return found
    }

    private static func destination(
        container: InventoryItem, crumbs: InventoryPlacementCrumbs,
        source: any InventoryQuerySource
    ) -> InventoryDestination {
        let count = source.inventoryContents(ofContainer: container.id).count
        return destination(container: container, crumbs: crumbs, count: count)
    }

    private static func destination(
        container: InventoryItem, crumbs: InventoryPlacementCrumbs, count: Int
    ) -> InventoryDestination {
        return InventoryDestination(
            id: container.id, name: container.name,
            kind: container.containment?.access == .open ? .container : .closedContainer,
            detail: crumbs.names(of: container.placement).joined(separator: " › "),
            count: count == 0 ? nil : count)
    }
}

extension InventoryLocationTree {
    /// The same places without the given containers, which the picker must
    /// not offer.
    internal func withoutContainers(_ blocked: Set<String>) -> InventoryLocationTree {
        InventoryLocationTree(
            nodes: nodes.map { node in
                InventoryLocationNode(
                    id: node.id, name: node.name, parentID: node.parentID, items: node.items,
                    containers: node.containers.filter { !blocked.contains($0.id) })
            })
    }
}
