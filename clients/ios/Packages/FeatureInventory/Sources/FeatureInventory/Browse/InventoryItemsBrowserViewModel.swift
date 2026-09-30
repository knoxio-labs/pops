import AppCore
import Foundation
import Observation

/// What changes the Items browser's ordered result set.
internal struct InventoryObservationKey: Equatable, Sendable {
    internal let text: String
    internal let filter: InventorySearchFilter
    internal let sort: InventoryItemSort
}

/// The Items browser's state and writes, over `InventoryStore`.
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
    internal private(set) var isLoadingNextPage = false
    internal private(set) var nextPageFailed = false
    internal let writer: InventoryWriter
    internal let runner: InventoryCommandRunner

    private let store: any InventoryStore
    private let now: @Sendable () -> Date
    private var activeKey: InventoryObservationKey?
    private var pageEpoch = UUID()
    private var appendedRecords: [InventoryRecord] = []
    private var loadedIDs: Set<InventoryItem.ID> = []
    private var nextCursor: InventoryPageCursor?
    private var activePageRequestID: UUID?

    internal init(store: any InventoryStore, now: @escaping @Sendable () -> Date = { .now }) {
        self.store = store
        self.now = now
        writer = InventoryWriter(store: store)
        runner = InventoryCommandRunner(store: store)
    }

    internal var observationKey: InventoryObservationKey {
        InventoryObservationKey(
            text: query.trimmingCharacters(in: .whitespacesAndNewlines), filter: filter, sort: sort)
    }

    internal var catalogue: InventoryItemsCatalogue? {
        guard case .loaded(let firstPage) = phase else { return nil }
        var records = firstPage.records
        records.append(contentsOf: appendedRecords)
        return InventoryItemsCatalogue(
            records: records, nextCursor: nextCursor, types: firstPage.types,
            offline: firstPage.offline, summary: firstPage.summary)
    }

    /// Follows the first page and invalidates later pages after every replica update.
    internal func observe() async {
        let key = observationKey
        if activeKey != key {
            activeKey = key
            pageEpoch = UUID()
            appendedRecords = []
            loadedIDs = []
            nextCursor = nil
            isLoadingNextPage = false
            nextPageFailed = false
            activePageRequestID = nil
        }
        var answered = false
        var firstEmission = true
        for await firstPage in store.observe(Self.query(key: key, cursor: nil, now: now())) {
            guard !Task.isCancelled, activeKey == key else { break }
            answered = true
            if !firstEmission {
                pageEpoch = UUID()
                appendedRecords = []
                isLoadingNextPage = false
                nextPageFailed = false
                activePageRequestID = nil
            }
            firstEmission = false
            loadedIDs = Set(firstPage.records.map(\.id))
            nextCursor = firstPage.nextCursor
            phase = .loaded(firstPage)
        }
        if !answered && activeKey == key && !Task.isCancelled { phase = .unavailable }
    }

    /// Loads the next bounded page once, keeping its cursor available after a failed read.
    internal func loadNextPage() async {
        guard !isLoadingNextPage, let key = activeKey, key == observationKey,
            let cursor = nextCursor
        else { return }
        let epoch = pageEpoch
        let requestID = UUID()
        activePageRequestID = requestID
        isLoadingNextPage = true
        nextPageFailed = false
        var answered = false
        for await page in store.observe(Self.query(key: key, cursor: cursor, now: now())) {
            guard !Task.isCancelled, activeKey == key, pageEpoch == epoch else { break }
            answered = true
            for record in page.records where loadedIDs.insert(record.id).inserted {
                appendedRecords.append(record)
            }
            nextCursor = page.nextCursor
            break
        }
        if !answered && activeKey == key && pageEpoch == epoch && activePageRequestID == requestID {
            nextPageFailed = true
        }
        if activePageRequestID == requestID {
            activePageRequestID = nil
            isLoadingNextPage = false
        }
    }

    internal func retryNextPage() async {
        await loadNextPage()
    }

    internal var canLoadMore: Bool { nextCursor != nil }

    internal var shown: [InventoryRecord] {
        let rows = catalogue?.records.filter(filter.matches) ?? []
        switch sort {
        case .recent:
            return rows.sorted {
                $0.createdAt == $1.createdAt ? $0.id < $1.id : $0.createdAt > $1.createdAt
            }
        case .name:
            return rows.sorted {
                switch $0.name.localizedCaseInsensitiveCompare($1.name) {
                case .orderedAscending: true
                case .orderedDescending: false
                case .orderedSame: $0.id < $1.id
                }
            }
        }
    }

    internal var sections: [InventoryItemSection] {
        InventoryItemSection.sections(shown, by: sort, now: now())
    }

    /// Counts are computed in SQLite, independently of the loaded row pages.
    internal var tiles: [InventoryCountTile] {
        let summary = catalogue?.summary
        return [
            InventoryCountTile(
                title: "Items", count: summary?.activeItems ?? 0,
                symbol: InventorySymbol.item.system),
            InventoryCountTile(
                title: "In hand", count: summary?.inHand ?? 0,
                symbol: InventorySymbol.inHand.system),
            InventoryCountTile(
                title: "Untyped", count: summary?.untyped ?? 0,
                symbol: InventorySymbol.waiting.system),
            InventoryCountTile(
                title: "Recent", count: summary?.createdRecently ?? 0,
                symbol: InventorySymbol.activity.system),
        ]
    }

    internal var offlineLine: String? { catalogue?.offline?.line(now: now()) }

    internal func thumbnail(_ sha256: String) async -> Data? {
        try? await store.photo(sha256, variant: .thumb)
    }

    private static func query(
        key: InventoryObservationKey, cursor: InventoryPageCursor?, now: Date
    ) -> InventoryQuery<InventoryItemsCatalogue> {
        InventoryItemsCatalogue.query(
            text: key.text, filter: key.filter, sort: key.sort,
            page: InventoryPageRequest(cursor: cursor), now: now)
    }
}
