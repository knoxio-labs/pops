import AppCore
import Foundation
import Observation

/// Where Store here puts things: into a container, or directly in a place.
internal enum InventoryStoreTarget: Equatable, Sendable {
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

    /// What the Undo capsule says once `count` items have been stored here.
    internal func storedMessage(count: Int) -> String {
        count == 1 ? "Stored in \(name)" : "Stored \(count) in \(name)"
    }
}

/// An item Store here can offer, as its pick row draws it.
internal struct InventoryStoreCandidate: Identifiable, Hashable, Sendable {
    internal let id: InventoryItem.ID
    internal let name: String
    internal let crumbs: [String]
    internal let isInHand: Bool
    internal let access: InventoryAccess?
    internal let photo: String?

    /// Reads one bounded page of eligible Store here items, applying placement exclusions before
    /// the source evaluates the page boundary.
    internal static func query(
        for target: InventoryStoreTarget, query: String, page: InventoryPageRequest
    ) -> InventoryQuery<InventoryPage<InventoryStoreCandidate>> {
        Self.query(text: query, page: page) { source in
            InventoryItemPageFilter(
                excludingIDs: refusedIds(for: target, source: source),
                excludingPlacement: target.placement)
        }
    }

    /// Reads one bounded page of items matching `text`, filtered by what
    /// `filter` builds from the replica it is read against.
    internal static func query(
        text: String, page: InventoryPageRequest,
        filter: @escaping @Sendable (any InventoryQuerySource) -> InventoryItemPageFilter
    ) -> InventoryQuery<InventoryPage<InventoryStoreCandidate>> {
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return InventoryQuery { source in
            let query = InventoryItemPageQuery(
                text: text, filter: filter(source),
                order: text.isEmpty ? .updatedAtNewest : .searchRelevance,
                page: page)
            let result = source.inventoryItemPage(query)
            let crumbs = InventoryPlacementCrumbs(source: source)
            let candidates = result.rows.map { item in
                InventoryStoreCandidate(
                    id: item.id, name: item.name, crumbs: crumbs.names(of: item.placement),
                    isInHand: item.placement == .hand, access: item.containment?.access,
                    photo: item.photos.first?.sha256)
            }
            return InventoryPage(rows: candidates, nextCursor: result.nextCursor)
        }
    }

    /// The target container and every container it sits inside.
    internal static func refusedIds(
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

/// Store here's existing-item list: the shared search and pages, and the
/// store itself, which is one `item.move` with the store verb per item.
@MainActor @Observable
internal final class InventoryStoreHereModel: InventoryExistingItemPicking {
    internal let target: InventoryStoreTarget
    internal let runner: InventoryCommandRunner
    internal let pages: InventoryCandidatePages

    internal init(
        target: InventoryStoreTarget, runner: InventoryCommandRunner, query: String = "",
        selected: Set<InventoryItem.ID> = []
    ) {
        self.target = target
        self.runner = runner
        pages = InventoryCandidatePages(
            store: runner.store, query: query, selected: selected,
            pageQuery: Self.pageQuery(for: target))
    }

    private static func pageQuery(for target: InventoryStoreTarget)
        -> InventoryCandidatePages.PageQuery
    {
        { text, cursor in
            InventoryStoreCandidate.query(
                for: target, query: text, page: InventoryPageRequest(cursor: cursor))
        }
    }

    internal var title: String { "Store in \(target.name)" }

    internal func commitTitle(count: Int) -> String {
        count == 0 ? "Store" : "Store \(count)"
    }

    /// Stores every picked item in the target and offers Undo. Returns
    /// whether they all landed.
    internal func store() async -> Bool {
        let ids = selected.sorted()
        guard !ids.isEmpty else { return false }
        let landed = await runner.perform(
            ids.map { .moveItem(id: $0, to: target.placement, verb: .store) },
            announcing: target.storedMessage(count: ids.count), symbol: .storeHere)
        if landed { pages.selected = [] }
        return landed
    }

    internal func commit() async -> Bool { await store() }

    internal func thumbnail(_ sha256: String) async -> Data? {
        try? await runner.store.photo(sha256, variant: .thumb)
    }
}
