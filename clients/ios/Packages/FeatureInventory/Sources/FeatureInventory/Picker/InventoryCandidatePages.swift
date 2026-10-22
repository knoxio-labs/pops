import AppCore
import Foundation
import Observation

/// One searched, paged, multi-select list of existing items, as the
/// existing-item pickers draw it: what is typed, what is picked, the first
/// page as the store observes it, and further pages loaded on demand.
@MainActor @Observable
internal final class InventoryCandidatePages {
    /// The query for one page of candidates matching `text`, from `cursor`.
    internal typealias PageQuery = @Sendable (String, InventoryPageCursor?) ->
        InventoryQuery<InventoryPage<InventoryStoreCandidate>>

    internal var query: String
    internal var selected: Set<InventoryItem.ID>
    internal private(set) var candidates: InventoryLoadPhase<[InventoryStoreCandidate]> = .loading
    internal private(set) var isLoadingNextPage = false
    internal private(set) var nextPageFailed = false

    private let store: any InventoryStore
    private let pageQuery: PageQuery
    private var activeQuery: String?
    private var firstPage: [InventoryStoreCandidate] = []
    private var appendedCandidates: [InventoryStoreCandidate] = []
    private var loadedIDs: Set<InventoryItem.ID> = []
    private var nextCursor: InventoryPageCursor?
    private var pageEpoch = UUID()
    private var activePageRequestID: UUID?

    internal init(
        store: any InventoryStore, query: String = "", selected: Set<InventoryItem.ID> = [],
        pageQuery: @escaping PageQuery
    ) {
        self.store = store
        self.query = query
        self.selected = selected
        self.pageQuery = pageQuery
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
        for await page in store.observe(pageQuery(text, nil)) {
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

    /// Loads another candidate page while preserving the cursor after a failed read.
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
        for await page in store.observe(pageQuery(text, cursor)) {
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

/// A model an existing-item picker can draw: the shared pages, plus what the
/// nav bar says and does with the picked items.
@MainActor internal protocol InventoryExistingItemPicking: AnyObject, Observable {
    var pages: InventoryCandidatePages { get }
    var title: String { get }
    /// The trailing button's label for `count` picked items.
    func commitTitle(count: Int) -> String
    /// Acts on the picked items; `true` closes the picker.
    func commit() async -> Bool
    func thumbnail(_ sha256: String) async -> Data?
}

extension InventoryExistingItemPicking {
    internal var query: String {
        get { pages.query }
        set { pages.query = newValue }
    }

    internal var selected: Set<InventoryItem.ID> { pages.selected }
    internal var candidates: InventoryLoadPhase<[InventoryStoreCandidate]> { pages.candidates }
    internal var shownCandidates: [InventoryStoreCandidate] { pages.shownCandidates }
    internal var canLoadMore: Bool { pages.canLoadMore }
    internal var isLoadingNextPage: Bool { pages.isLoadingNextPage }
    internal var nextPageFailed: Bool { pages.nextPageFailed }

    internal func observe() async { await pages.observe() }
    internal func toggle(_ id: InventoryItem.ID) { pages.toggle(id) }
    internal func loadNextPage() async { await pages.loadNextPage() }
    internal func retryNextPage() async { await pages.retryNextPage() }
}
