import AppCore
import Observation

/// The accounts screen's whole decision surface.
///
/// The view reads these and renders; it decides nothing — the same split
/// `TransactionsListViewModel` draws and for the same reason: "what does this
/// screen do when finance goes down" is a test here rather than something
/// somebody reproduces on a phone.
///
/// Unlike the transactions list, there is no cursor: an account list is small
/// enough in the ordinary case to fetch whole, and ``AccountsRepository``
/// says so — see its doc comment. So this model has one fetch, not a paging
/// state machine.
@MainActor
@Observable
public final class AccountsListViewModel {
    public private(set) var state: AccountsListState = .loading

    /// A refresh that failed while accounts the user can still read were on
    /// screen. Reported next to those rows rather than replacing them, for the
    /// same reason `TransactionsListViewModel.refreshFailure` is.
    public private(set) var refreshFailure: RepositoryError?

    /// Search text, live from the field. Filtering is a presentation decision
    /// over ``state``, not a second network round trip — see
    /// ``AccountsSections``.
    public var searchText = ""

    /// Whether the Archived section is showing. Off by default: the screen
    /// opens on the active list, because an archived account is one somebody
    /// has already said they are done with.
    public var showArchived = false

    private let repository: any AccountsRepository
    private let router: Router

    private var hasLoaded = false
    private var isLoading = false
    private var isRefreshing = false
    private var generation = 0

    public init(dependencies: AppDependencies, router: Router) {
        repository = dependencies.accounts
        self.router = router
    }

    /// The section breakdown the view draws, built fresh from whatever is
    /// loaded plus the live search text and archived toggle.
    internal var sections: AccountsSections {
        guard case .loaded(let accounts) = state else {
            return AccountsSections(held: [], owed: [], archived: [])
        }
        return AccountsSections.build(from: accounts, query: searchText, showArchived: showArchived)
    }
}

extension AccountsListViewModel {
    public func select(_ account: Account) {
        router.send(.push(.accountDetail(id: account.id)))
    }

    /// The row this list is already holding for `id`, if it has one — what
    /// lets the detail screen open on real content instead of a spinner.
    public func account(id: Account.ID) -> Account? {
        guard case .loaded(let accounts) = state else { return nil }
        return accounts.first { $0.id == id }
    }
}

extension AccountsListViewModel {
    /// Safe to call on every appearance: does nothing once a fetch has landed,
    /// and retries when one never did.
    public func loadAccounts() async {
        guard !hasLoaded, !isLoading, !isRefreshing else { return }

        state = .loading
        isLoading = true
        defer { isLoading = false }

        let epoch = generation
        do {
            let accounts = try await repository.accounts()
            guard epoch == generation else { return }
            show(accounts)
        } catch let error where error.isCancellation {
            return
        } catch {
            guard epoch == generation else { return }
            state = .failed(RepositoryError.describing(error))
        }
    }

    /// Pull-to-refresh. Replaces whatever is on screen; never merges into it.
    public func refresh() async {
        guard !isRefreshing else { return }

        isRefreshing = true
        generation += 1
        let epoch = generation
        refreshFailure = nil
        defer { isRefreshing = false }

        do {
            let accounts = try await repository.accounts()
            guard epoch == generation else { return }
            show(accounts)
        } catch let error where error.isCancellation {
            return
        } catch {
            guard epoch == generation else { return }
            refreshFailure = RepositoryError.describing(error)
        }
    }

    private func show(_ accounts: [Account]) {
        hasLoaded = true
        state = accounts.isEmpty ? .empty : .loaded(accounts)
    }
}
