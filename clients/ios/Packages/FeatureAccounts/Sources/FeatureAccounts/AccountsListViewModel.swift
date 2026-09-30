import AppCore
import Foundation
import Observation

@MainActor
@Observable
public final class AccountsListViewModel {
    /// The first page's loading, empty, failure, or loaded-row state.
    public private(set) var state: AccountsListState = .loading

    /// The cursor state for additional pages while rows remain visible.
    public private(set) var paging: AccountsPagingState = .exhausted

    /// A failed refresh, retained beside rows already loaded.
    public private(set) var refreshFailure: RepositoryError?

    /// The most recent failure while loading another page.
    public private(set) var pageFailure: RepositoryError?

    /// Total number of rows matching the current server-side filters, if known.
    public private(set) var totalCount: Int?
    internal private(set) var pageRevision = 0

    /// Search text applied by the repository before paging.
    public var searchText = ""

    /// Whether the list includes archived accounts in its server query.
    public var showArchived = false

    private let repository: any AccountsRepository
    private let router: Router
    private let pageSize = 25

    private var cursor: String?
    private var consumedCursors: Set<String> = []
    private var loadedFilter: AccountsListFilter?
    private var firstPageRequest: UUID?
    private var firstPageFilter: AccountsListFilter?
    private var refreshRequest: UUID?
    private var generation = 0

    /// Creates the account list model with the account repository and router.
    public init(dependencies: AppDependencies, router: Router) {
        repository = dependencies.accounts
        self.router = router
    }

    internal var requestFilter: AccountsListFilter {
        let search = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        return AccountsListFilter(
            search: search.isEmpty ? nil : search, archived: showArchived ? nil : false)
    }

    internal var sections: AccountsSections {
        guard case .loaded(let accounts) = state else {
            return AccountsSections(held: [], owed: [], archived: [])
        }
        return AccountsSections.build(from: accounts, showArchived: showArchived)
    }

    /// Opens the account detail route for a selected account.
    public func select(_ account: Account) {
        router.send(.push(.accountDetail(id: account.id)))
    }

    /// Returns a currently loaded account by id, if one exists.
    public func account(id: Account.ID) -> Account? {
        guard case .loaded(let accounts) = state else { return nil }
        return accounts.first { $0.id == id }
    }

    /// Loads the first page for the current search and archive scope.
    public func loadAccounts() async {
        let filter = requestFilter
        if loadedFilter == filter {
            switch state {
            case .empty, .loaded:
                return
            case .loading, .failed:
                break
            }
        }
        guard firstPageFilter != filter else { return }

        generation += 1
        let epoch = generation
        let requestID = UUID()
        firstPageRequest = requestID
        firstPageFilter = filter
        cursor = nil
        consumedCursors.removeAll()
        paging = .exhausted
        pageFailure = nil
        refreshFailure = nil
        totalCount = nil
        state = .loading

        defer {
            if firstPageRequest == requestID {
                firstPageRequest = nil
                firstPageFilter = nil
            }
        }

        do {
            let page = try await repository.accountPage(
                search: filter.search,
                archived: filter.archived,
                cursor: nil,
                limit: pageSize
            )
            guard isCurrent(epoch: epoch, filter: filter) else { return }
            showFirstPage(page, for: filter)
        } catch let error where error.isCancellation {
            return
        } catch {
            guard isCurrent(epoch: epoch, filter: filter) else { return }
            state = .failed(RepositoryError.describing(error))
        }
    }

    /// Refreshes the current filtered list, keeping rows visible if it fails.
    public func refresh() async {
        let filter = requestFilter
        generation += 1
        let epoch = generation
        let requestID = UUID()
        refreshRequest = requestID
        refreshFailure = nil

        defer {
            if refreshRequest == requestID { refreshRequest = nil }
        }

        do {
            let page = try await repository.accountPage(
                search: filter.search,
                archived: filter.archived,
                cursor: nil,
                limit: pageSize
            )
            guard isCurrent(epoch: epoch, filter: filter) else { return }
            showFirstPage(page, for: filter)
        } catch let error where error.isCancellation {
            guard epoch == generation else { return }
            settlePagingIfLoading()
            return
        } catch {
            guard isCurrent(epoch: epoch, filter: filter) else { return }
            refreshFailure = RepositoryError.describing(error)
            settlePagingIfLoading()
        }
    }

    /// Fetches another page when the scroll footer reaches the viewport.
    public func loadNextPageIfNeeded() async {
        guard paging == .idle else { return }
        await fetchNextPage()
    }

    /// Retries a failed page using the same continuation token.
    public func retryNextPage() async {
        guard case .failed = paging else { return }
        await fetchNextPage()
    }

    private func isCurrent(epoch: Int, filter: AccountsListFilter) -> Bool {
        epoch == generation && filter == requestFilter
    }

    private func showFirstPage(_ page: AccountsPage, for filter: AccountsListFilter) {
        let accounts = unique(page.accounts)
        cursor = page.nextCursor
        consumedCursors.removeAll()
        loadedFilter = filter
        totalCount = page.totalCount
        state = accounts.isEmpty && filter.search == nil ? .empty : .loaded(accounts)
        paging = page.nextCursor == nil ? .exhausted : .idle
        pageRevision += 1
    }

    private func fetchNextPage() async {
        guard let requestedCursor = cursor, loadedFilter == requestFilter else { return }
        paging = .loading
        pageFailure = nil

        let epoch = generation
        let filter = requestFilter
        do {
            let page = try await repository.accountPage(
                search: filter.search,
                archived: filter.archived,
                cursor: requestedCursor,
                limit: pageSize
            )
            guard isCurrent(epoch: epoch, filter: filter) else { return }

            let nextCursor = page.nextCursor
            let repeatedCursor =
                nextCursor == requestedCursor
                || nextCursor.map(consumedCursors.contains) == true
            let accounts = merged(page.accounts)
            cursor = repeatedCursor ? requestedCursor : nextCursor
            consumedCursors.insert(requestedCursor)
            totalCount = page.totalCount ?? totalCount
            state = .loaded(accounts)
            pageRevision += 1

            if repeatedCursor {
                paging = .failed(.contractMismatch)
                pageFailure = .contractMismatch
            } else {
                paging = nextCursor == nil ? .exhausted : .idle
            }
        } catch let error where error.isCancellation {
            guard epoch == generation else { return }
            paging = cursor == nil ? .exhausted : .idle
        } catch {
            guard isCurrent(epoch: epoch, filter: filter) else { return }
            let failure = RepositoryError.describing(error)
            paging = .failed(failure)
            pageFailure = failure
        }
    }

    private func merged(_ incoming: [Account]) -> [Account] {
        guard case .loaded(let existing) = state else { return unique(incoming) }
        var seen = Set(existing.map(\.id))
        return existing + incoming.filter { seen.insert($0.id).inserted }
    }

    private func unique(_ accounts: [Account]) -> [Account] {
        var seen: Set<Account.ID> = []
        return accounts.filter { seen.insert($0.id).inserted }
    }

    private func settlePagingIfLoading() {
        guard paging == .loading else { return }
        paging = cursor == nil ? .exhausted : .idle
    }
}

internal struct AccountsListFilter: Hashable, Sendable {
    let search: String?
    let archived: Bool?
}

/// The state of the next page, kept separate so a tail failure does not hide
/// accounts already on screen.
public enum AccountsPagingState: Hashable, Sendable {
    /// Another page is available and no request is running.
    case idle
    /// A page request is in flight.
    case loading
    /// The most recent page request failed and can be retried.
    case failed(RepositoryError)
    /// No next cursor was returned by the last successful page.
    case exhausted
}
