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
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return InventoryQuery { source in
            let excluded = refusedIds(for: target, source: source)
            let query = InventoryItemPageQuery(
                text: text,
                filter: InventoryItemPageFilter(
                    excludingIDs: excluded, excludingPlacement: target.placement),
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
    internal private(set) var candidates: InventoryLoadPhase<[InventoryStoreCandidate]> = .loading
    internal private(set) var isLoadingNextPage = false
    internal private(set) var nextPageFailed = false

    private let store: any InventoryStore
    private var activeQuery: String?
    private var firstPage: [InventoryStoreCandidate] = []
    private var appendedCandidates: [InventoryStoreCandidate] = []
    private var loadedIDs: Set<InventoryItem.ID> = []
    private var nextCursor: InventoryPageCursor?
    private var pageEpoch = UUID()
    private var activePageRequestID: UUID?

    internal init(
        target: InventoryStoreTarget, runner: InventoryCommandRunner, query: String = "",
        selected: Set<InventoryItem.ID> = []
    ) {
        self.target = target
        self.runner = runner
        store = runner.store
        self.query = query
        self.selected = selected
    }

    /// Follows the candidates for the current query; the view restarts this
    /// whenever the query changes.
    internal func observe() async {
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if activeQuery != text {
            activeQuery = text
            resetPages()
        }
        candidates = .loading
        var answered = false
        var firstEmission = true
        for await page in store.observe(Self.query(target: target, text: text, cursor: nil)) {
            guard !Task.isCancelled, activeQuery == text else { break }
            answered = true
            if !firstEmission {
                pageEpoch = UUID()
                appendedCandidates = []
                loadedIDs = []
                isLoadingNextPage = false
                nextPageFailed = false
                activePageRequestID = nil
            }
            firstEmission = false
            firstPage = page.rows
            appendedCandidates = []
            loadedIDs = Set(page.rows.map(\.id))
            nextCursor = page.nextCursor
            candidates = .loaded(page.rows)
        }
        if !answered && activeQuery == text && !Task.isCancelled { candidates = .unavailable }
    }

    internal func toggle(_ id: InventoryItem.ID) {
        if selected.remove(id) == nil { selected.insert(id) }
    }

    internal var shownCandidates: [InventoryStoreCandidate] {
        firstPage + appendedCandidates
    }

    internal var canLoadMore: Bool { nextCursor != nil }

    /// Loads another eligible candidate page while preserving the cursor after a failed read.
    internal func loadNextPage() async {
        guard !isLoadingNextPage, let text = activeQuery,
            text == query.trimmingCharacters(in: .whitespacesAndNewlines),
            let cursor = nextCursor
        else { return }
        let epoch = pageEpoch
        let requestID = UUID()
        activePageRequestID = requestID
        isLoadingNextPage = true
        nextPageFailed = false
        var answered = false
        for await page in store.observe(Self.query(target: target, text: text, cursor: cursor)) {
            guard !Task.isCancelled, activeQuery == text, pageEpoch == epoch,
                activePageRequestID == requestID
            else { break }
            answered = true
            for candidate in page.rows where loadedIDs.insert(candidate.id).inserted {
                appendedCandidates.append(candidate)
            }
            nextCursor = page.nextCursor
            break
        }
        if !answered && activeQuery == text && pageEpoch == epoch
            && activePageRequestID == requestID
        {
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

    private static func query(
        target: InventoryStoreTarget, text: String, cursor: InventoryPageCursor?
    ) -> InventoryQuery<InventoryPage<InventoryStoreCandidate>> {
        InventoryStoreCandidate.query(
            for: target, query: text,
            page: InventoryPageRequest(cursor: cursor))
    }

    private func resetPages() {
        firstPage = []
        appendedCandidates = []
        loadedIDs = []
        nextCursor = nil
        pageEpoch = UUID()
        activePageRequestID = nil
        isLoadingNextPage = false
        nextPageFailed = false
    }
}
