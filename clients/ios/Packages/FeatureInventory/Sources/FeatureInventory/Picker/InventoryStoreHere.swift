import AppCore
import Foundation
import Observation

/// Where Store here puts things: into a container, or directly in a place.
internal enum InventoryStoreTarget: Equatable {
    case container(id: InventoryItem.ID, name: String)
    case location(id: InventoryLocation.ID, name: String)

    internal var name: String {
        switch self {
        case .container(_, let name), .location(_, let name): name
        }
    }

    internal var placement: InventoryPlacement {
        switch self {
        case .container(let id, _): .container(id)
        case .location(let id, _): .location(id)
        }
    }
}

/// An item Store here can offer, as its pick row draws it.
internal struct InventoryStoreCandidate: Identifiable, Equatable {
    internal let id: InventoryItem.ID
    internal let name: String
    internal let crumbs: [String]
    internal let isInHand: Bool
    internal let access: InventoryAccess?
    internal let photo: String?

    /// Items Store here offers for `query`: the recently touched ones while
    /// nothing is typed, the matches once something is. Never an inactive
    /// item, one already there, the container itself, or a container that
    /// holds the target (storing it would put the target inside itself).
    internal static func candidates(
        reading source: any InventoryQuerySource, for target: InventoryStoreTarget,
        query: String, recentLimit: Int = 50
    ) -> [InventoryStoreCandidate] {
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let found =
            text.isEmpty
            ? source.inventoryRecents(limit: recentLimit)
            : source.inventorySearch(text: text, includeInactive: false)
        let crumbs = InventoryPlacementCrumbs(source: source)
        let refused = refusedIds(for: target, source: source)
        return found.filter {
            $0.isLive && $0.placement != target.placement && !refused.contains($0.id)
        }
        .map { item in
            InventoryStoreCandidate(
                id: item.id, name: item.name, crumbs: crumbs.names(of: item.placement),
                isInHand: item.placement == .hand, access: item.containment?.access,
                photo: item.photos.first?.sha256)
        }
    }

    /// The target container and every container it sits inside.
    private static func refusedIds(
        for target: InventoryStoreTarget, source: any InventoryQuerySource
    ) -> Set<InventoryItem.ID> {
        guard case .container(let id, _) = target else { return [] }
        var refused: Set<InventoryItem.ID> = [id]
        var current = source.inventoryItem(id: id)?.placement
        while case .container(let parent) = current, refused.insert(parent).inserted {
            current = source.inventoryItem(id: parent)?.placement
        }
        return refused
    }
}

/// Store here's existing-item list: what is typed, what is picked, and the
/// store itself, which is one `item.move` with the store verb per item.
@MainActor @Observable
internal final class InventoryStoreHereModel {
    internal let target: InventoryStoreTarget
    internal let runner: InventoryCommandRunner
    internal var query: String
    internal var selected: Set<InventoryItem.ID>
    internal private(set) var candidates: InventoryObservation<[InventoryStoreCandidate]>

    internal init(
        target: InventoryStoreTarget, runner: InventoryCommandRunner, query: String = "",
        selected: Set<InventoryItem.ID> = []
    ) {
        self.target = target
        self.runner = runner
        self.query = query
        self.selected = selected
        candidates = Self.observation(target: target, query: query, store: runner.store)
    }

    /// Follows the candidates for the current query; the view restarts this
    /// whenever the query changes.
    internal func observe() async {
        candidates = Self.observation(target: target, query: query, store: runner.store)
        await candidates.observe()
    }

    internal func toggle(_ id: InventoryItem.ID) {
        if selected.remove(id) == nil { selected.insert(id) }
    }

    /// Stores every picked item in the target and offers Undo. Returns
    /// whether they all landed.
    internal func store() async -> Bool {
        let ids = selected.sorted()
        guard !ids.isEmpty else { return false }
        let message =
            ids.count == 1 ? "Stored in \(target.name)" : "Stored \(ids.count) in \(target.name)"
        let landed = await runner.perform(
            ids.map { .moveItem(id: $0, to: target.placement, verb: .store) },
            announcing: message, symbol: .storeHere)
        if landed { selected = [] }
        return landed
    }

    private static func observation(
        target: InventoryStoreTarget, query: String, store: any InventoryStore
    ) -> InventoryObservation<[InventoryStoreCandidate]> {
        InventoryObservation(
            store: store,
            query: InventoryQuery {
                InventoryStoreCandidate.candidates(reading: $0, for: target, query: query)
            })
    }
}
