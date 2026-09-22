import AppCore
import Observation

@MainActor @Observable
internal final class PurchasesArchiveViewModel {
    internal private(set) var scope: PurchasesArchiveScope

    internal var purchases: [Purchase] { current.purchases }
    internal var months: [ArchiveMonth] {
        PurchasesArchive.months(purchases, scope: scope, paging: paging)
    }
    internal var topLevelState: TopLevelState { current.topLevel }
    internal var paging: ArchivePaging { current.paging }
    internal var totalCount: Int? { current.totalCount }

    private let repository: any PurchasesRepository
    private let onSelect: (Purchase) -> Void
    private var states: [PurchasesArchiveScope: ScopeState] = [
        .all: ScopeState(),
        .unmatched: ScopeState(),
    ]
    private var generation = 0

    internal init(
        dependencies: AppDependencies,
        initialScope: PurchasesArchiveScope = .all,
        onSelect: @escaping (Purchase) -> Void = { _ in }
    ) {
        repository = dependencies.purchases
        scope = initialScope
        self.onSelect = onSelect
    }

    internal func setScope(_ newScope: PurchasesArchiveScope) async {
        guard newScope != scope else { return }
        invalidateRequests()
        scope = newScope
        await loadFirstPageIfNeeded()
    }

    internal func loadFirstPageIfNeeded() async {
        let requestScope = scope
        guard !state(for: requestScope).hasLoaded,
            !state(for: requestScope).isLoadingFirstPage
        else { return }

        update(requestScope) {
            $0.topLevel = .loading
            $0.isLoadingFirstPage = true
        }
        let epoch = generation
        do {
            let page = try await repository.purchases(
                after: nil, statusFilter: requestScope.statusFilter)
            guard epoch == generation, requestScope == scope else { return }
            update(requestScope) {
                $0.purchases = Self.unique(page.purchases)
                $0.cursor = page.nextCursor
                $0.hasLoaded = true
                $0.isLoadingFirstPage = false
                $0.totalCount = page.totalCount
                $0.topLevel = .loaded
                $0.paging = page.nextCursor == nil ? .end : .loading
            }
        } catch let error where error is CancellationError || Task.isCancelled {
            guard epoch == generation, requestScope == scope else { return }
            update(requestScope) { $0.isLoadingFirstPage = false }
        } catch {
            guard epoch == generation, requestScope == scope else { return }
            update(requestScope) {
                $0.isLoadingFirstPage = false
                $0.topLevel = .failed(RepositoryError.describing(error))
            }
        }
    }

    internal func loadNextPageIfNeeded() async {
        let requestScope = scope
        let snapshot = state(for: requestScope)
        guard snapshot.hasLoaded, snapshot.paging == .loading,
            !snapshot.isFetchingNextPage, let cursor = snapshot.cursor
        else { return }
        await fetchNextPage(cursor: cursor, scope: requestScope)
    }

    internal func retryNextPage() async {
        let requestScope = scope
        let snapshot = state(for: requestScope)
        guard snapshot.paging == .failed, !snapshot.isFetchingNextPage,
            let cursor = snapshot.cursor
        else { return }
        update(requestScope) { $0.paging = .loading }
        await fetchNextPage(cursor: cursor, scope: requestScope)
    }

    internal func select(_ purchase: Purchase) {
        onSelect(purchase)
    }

    private var current: ScopeState { state(for: scope) }

    private func fetchNextPage(cursor: String, scope requestScope: PurchasesArchiveScope) async {
        update(requestScope) { $0.isFetchingNextPage = true }
        let epoch = generation
        do {
            let page = try await repository.purchases(
                after: cursor, statusFilter: requestScope.statusFilter)
            guard epoch == generation, requestScope == scope else { return }
            update(requestScope) {
                $0.purchases = Self.merging(page.purchases, into: $0.purchases)
                $0.cursor = page.nextCursor
                $0.isFetchingNextPage = false
                $0.paging = page.nextCursor == nil ? .end : .loading
            }
        } catch let error where error is CancellationError || Task.isCancelled {
            guard epoch == generation, requestScope == scope else { return }
            update(requestScope) {
                $0.isFetchingNextPage = false
                $0.paging = .loading
            }
        } catch {
            guard epoch == generation, requestScope == scope else { return }
            update(requestScope) {
                $0.isFetchingNextPage = false
                $0.paging = .failed
            }
        }
    }

    private func invalidateRequests() {
        generation += 1
        for key in PurchasesArchiveScope.allCases {
            update(key) { $0.settleTransientLoading() }
        }
    }

    private func state(for scope: PurchasesArchiveScope) -> ScopeState {
        states[scope] ?? ScopeState()
    }

    private func update(
        _ scope: PurchasesArchiveScope,
        _ change: (inout ScopeState) -> Void
    ) {
        var value = state(for: scope)
        change(&value)
        states[scope] = value
    }

    private static func unique(_ purchases: [Purchase]) -> [Purchase] {
        merging(purchases, into: [])
    }

    private static func merging(_ incoming: [Purchase], into existing: [Purchase]) -> [Purchase] {
        var seen = Set(existing.map(\.id))
        return existing + incoming.filter { seen.insert($0.id).inserted }
    }
}
