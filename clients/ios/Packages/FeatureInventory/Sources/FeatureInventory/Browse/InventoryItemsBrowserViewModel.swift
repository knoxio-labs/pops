import AppCore
import Foundation
import Observation

/// What a list screen's observation depends on: a change to either restarts
/// it, and nothing else does, so a filter that only narrows locally never
/// re-reads the store.
internal struct InventoryObservationKey: Hashable, Sendable {
    internal let text: String
    internal let includeInactive: Bool
}

/// The Items browser's state and writes, over `InventoryStore`.
///
/// The store answers the query and the lifecycle half of the filter; the
/// rest of the filter, the sort and the sections are local, per the filter
/// sheet's predicates.
@MainActor @Observable
internal final class InventoryItemsBrowserViewModel {
    internal enum Phase: Equatable {
        case loading
        case loaded(InventoryItemsCatalogue)
        case unavailable
    }

    internal var query = ""
    internal var filter = InventorySearchFilter()
    internal var sort = InventoryItemSort.recent
    internal private(set) var phase: Phase = .loading
    internal let writer: InventoryWriter

    private let store: any InventoryStore
    private let now: @Sendable () -> Date

    internal init(store: any InventoryStore, now: @escaping @Sendable () -> Date = { .now }) {
        self.store = store
        self.now = now
        writer = InventoryWriter(store: store)
    }

    internal var observationKey: InventoryObservationKey {
        InventoryObservationKey(
            text: query.trimmingCharacters(in: .whitespacesAndNewlines),
            includeInactive: filter.includesInactive)
    }

    internal var catalogue: InventoryItemsCatalogue? {
        guard case .loaded(let catalogue) = phase else { return nil }
        return catalogue
    }

    /// Follows the store for the current key until the calling task is
    /// cancelled. The last answer stays up while a new key's first answer is
    /// on its way, so typing never flashes the skeleton.
    internal func observe() async {
        var answered = false
        for await catalogue in store.observe(
            InventoryItemsCatalogue.query(
                text: observationKey.text, includeInactive: observationKey.includeInactive))
        {
            answered = true
            phase = .loaded(catalogue)
        }
        if !answered && catalogue == nil && !Task.isCancelled { phase = .unavailable }
    }

    /// The rows the list shows: the filter, then the query, then the sort.
    internal var shown: [InventoryRecord] {
        guard let catalogue else { return [] }
        let kept = catalogue.records.filter {
            filter.matches($0) && (catalogue.matched?.contains($0.id) ?? true)
        }
        switch sort {
        case .recent:
            return kept.sorted { $0.createdAt > $1.createdAt }
        case .name:
            return kept.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
        }
    }

    internal var sections: [InventoryItemSection] {
        InventoryItemSection.sections(shown, by: sort, now: now())
    }

    /// The counts over the list: active items only, whatever the filter.
    internal var tiles: [InventoryCountTile] {
        let active = catalogue?.records.filter(\.isActive) ?? []
        let today = now()
        return [
            InventoryCountTile(
                title: "Items", count: active.count, symbol: InventorySymbol.item.system),
            InventoryCountTile(
                title: "In hand", count: active.filter { $0.placement == .hand }.count,
                symbol: InventorySymbol.inHand.system),
            InventoryCountTile(
                title: "Untyped", count: active.filter { $0.typeKey == nil }.count,
                symbol: InventorySymbol.waiting.system),
            InventoryCountTile(
                title: "Recent", count: active.filter { $0.isRecent(now: today) }.count,
                symbol: InventorySymbol.activity.system),
        ]
    }

    internal var offlineLine: String? {
        catalogue?.offline?.line(now: now())
    }

    internal func thumbnail(_ sha256: String) async -> Data? {
        try? await store.photo(sha256, variant: .thumb)
    }
}
