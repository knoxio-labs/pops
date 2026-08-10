import AppCore
import Observation

/// The transactions screen's whole decision surface.
///
/// The view reads these and renders; it decides nothing. That split is what
/// makes "what does the list do when finance goes down halfway through a
/// scroll" a test rather than something someone tries to reproduce on a phone
/// — and it is why no networking type appears here: this talks to `AppCore`'s
/// ``TransactionsRepository`` and has no idea whether an HTTP call happened.
///
/// ## Cursors, and the two ways paging goes wrong
///
/// The cursor is the server's, opaque, and never derived here. Offsets are the
/// alternative and they are wrong for the same reason on every list that
/// mutates: a row inserted at the head between two requests shifts every offset
/// after it, so page two re-sends a row page one already showed and skips one
/// nobody ever sees.
///
/// The subtler failure is a response landing *after* the list it was requested
/// for has been thrown away. A pull-to-refresh that resets the cursor while a
/// page fetch is in flight gets the fresh first page, and then the older
/// request completes and appends rows from the list that no longer exists.
/// ``generation`` is what makes that impossible: a fetch captures it before
/// awaiting and discards its own result if the value moved underneath it.
@MainActor
@Observable
public final class TransactionsListViewModel {
    /// What the screen shows. Loading, empty, failed and loaded — and no
    /// combination of them, because there is only one value.
    public private(set) var state: TransactionsListState = .loading

    /// What the *end* of the list is doing. Meaningful only while ``state`` has
    /// rows in it; the view draws it as a footer under them.
    public private(set) var paging: PagingState = .idle

    /// A refresh that failed while rows the user can still read were on screen.
    ///
    /// Reported next to those rows rather than replacing them: a refresh is an
    /// offer to re-check, and answering it by deleting what someone was reading
    /// punishes the gesture. Nil once a refresh succeeds.
    public private(set) var refreshFailure: RepositoryError?

    private let repository: any TransactionsRepository

    /// Where a tap goes. Held here rather than reached for in the view so that
    /// "tapping a row opens that transaction" is a value a test reads back off
    /// ``Router/path`` instead of a gesture somebody has to make on a phone.
    private let router: Router

    /// The next page's cursor, or `nil` when there is no next page. Opaque.
    private var cursor: String?

    /// Whether a first page has ever landed. What separates "still loading"
    /// from "loaded, and empty", and what stops ``loadFirstPage()`` refetching
    /// every time the view reappears.
    private var hasLoaded = false

    /// Re-entrancy protection for the **first** page only, which is the one
    /// request with no other state standing in for it: two `.task` invocations
    /// both find `hasLoaded` false and would both fetch.
    ///
    /// A next page needs no equivalent, and must not have one. ``paging`` is
    /// already the mutex there — `fetchNextPage()` writes `.loading` before its
    /// first `await`, and on this actor nothing interleaves between the caller's
    /// guard and that write. A second flag would additionally outlive a fetch a
    /// refresh superseded, so a stale request stuck on a slow connection — the
    /// reason somebody pulled to refresh in the first place — would stop the
    /// refreshed list paging until it finally answered.
    private var isLoadingFirstPage = false
    private var isRefreshing = false

    /// Bumped by every refresh, so an older in-flight fetch can recognise that
    /// the list it was reading into has been replaced.
    private var generation = 0

    /// - Parameters:
    ///   - dependencies: read for ``TransactionsRepository`` and nothing else.
    ///     The composition root is the only thing that knows what is behind it.
    ///   - router: where a tap on a row goes. Required rather than defaulted to
    ///     a fresh ``Router``: a default would give every caller that forgot one
    ///     a path nothing is rendering, and a screen that silently refuses to
    ///     navigate is the kind of defect that survives a test suite.
    public init(dependencies: AppDependencies, router: Router) {
        repository = dependencies.transactions
        self.router = router
    }
}

extension TransactionsListViewModel {
    /// A row was tapped.
    ///
    /// The model names the route and nothing else. It does not know which view
    /// answers to it, which is what stops this file from having to import the
    /// detail screen in order to link to it.
    public func select(_ transaction: Transaction) {
        router.send(.push(.transactionDetail(id: transaction.id)))
    }

    /// The row this list is already holding for `id`, if it has one.
    ///
    /// This is what lets the detail screen open on real content instead of a
    /// spinner over data the app has had all along. `nil` is an honest answer
    /// rather than a miss to work around: a route restored from a cold launch,
    /// or one reached after a refresh dropped the row, has no seed and the
    /// detail screen loads from scratch.
    public func transaction(id: Transaction.ID) -> Transaction? {
        guard case .loaded(let transactions) = state else { return nil }
        return transactions.first { $0.id == id }
    }
}

extension TransactionsListViewModel {
    /// The first page.
    ///
    /// Safe to call on every appearance: it does nothing once a page has
    /// landed, and retries when one never did — which is what the full-screen
    /// error state's retry calls, rather than a second entry point that would
    /// have to keep the same guards.
    public func loadFirstPage() async {
        guard !hasLoaded, !isLoadingFirstPage, !isRefreshing else { return }

        state = .loading
        isLoadingFirstPage = true
        defer { isLoadingFirstPage = false }

        let epoch = generation
        do {
            let page = try await repository.transactions(after: nil)
            guard epoch == generation else { return }
            show(page.transactions, nextCursor: page.nextCursor)
        } catch let error where error.isCancellation {
            return
        } catch {
            guard epoch == generation else { return }
            state = .failed(RepositoryError.describing(error))
        }
    }

    /// Called when the end of the list comes into view.
    ///
    /// Fetches only from ``PagingState/idle``, which is the whole of the
    /// duplicate-fetch protection: a second call while one is in flight, or
    /// after the last page, or after a failure, finds a state that is not
    /// `idle` and returns.
    public func loadNextPageIfNeeded() async {
        guard paging == .idle else { return }
        await fetchNextPage()
    }

    /// The retry the failed tail offers.
    ///
    /// Deliberately not reachable from the scroll position: the row that
    /// triggered a failed fetch is still on screen afterwards, so letting the
    /// appearance trigger retry would turn one failure into an unbounded loop
    /// against a server that is already unhappy — and do it on cellular.
    public func retryNextPage() async {
        guard case .failed = paging else { return }
        await fetchNextPage()
    }

    /// Pull-to-refresh. Resets the cursor and replaces the rows; it never
    /// merges into what is on screen.
    ///
    /// Supersedes a page fetch already in flight rather than waiting for it or
    /// dropping the gesture — the fetch's result is discarded when it lands.
    ///
    /// A refresh that ends without a page — cancelled, or failed — still has to
    /// leave ``paging`` settled. It may have superseded a fetch that will never
    /// come back to clear the `.loading` it set, and a footer left spinning is
    /// a list that never pages again for the rest of the session.
    ///
    /// ``refreshFailure`` is cleared *before* the request rather than only on
    /// success, and that is not tidiness. The view announces the failure to
    /// VoiceOver from an `onChange`, so a second refresh that fails the same way
    /// as the first would write an identical value, change nothing, and say
    /// nothing — leaving somebody who cannot see the banner with a retry that
    /// produced silence. Clearing first makes every failure a `nil -> error`
    /// transition. ``fetchNextPage()`` needs no equivalent because it passes
    /// through ``PagingState/loading`` on its way, which is already a change.
    public func refresh() async {
        guard !isRefreshing else { return }

        isRefreshing = true
        generation += 1
        let epoch = generation
        refreshFailure = nil
        defer { isRefreshing = false }

        do {
            let page = try await repository.transactions(after: nil)
            guard epoch == generation else { return }
            show(page.transactions, nextCursor: page.nextCursor)
        } catch let error where error.isCancellation {
            guard epoch == generation else { return }
            settlePagingIfLoading()
        } catch {
            guard epoch == generation else { return }
            refreshFailure = RepositoryError.describing(error)
            settlePagingIfLoading()
        }
    }
}

extension TransactionsListViewModel {
    /// - Note: `paging` is this method's own mutex, written before the first
    ///   `await`, so every caller's guard on it is still true when this runs.
    ///   Nothing else may gate a next page — see ``isLoadingFirstPage``.
    private func fetchNextPage() async {
        guard hasLoaded, !isRefreshing, let cursor else { return }

        paging = .loading

        let epoch = generation
        do {
            let page = try await repository.transactions(after: cursor)
            guard epoch == generation else { return }
            show(merging: page.transactions, nextCursor: page.nextCursor)
        } catch let error where error.isCancellation {
            // Not a failure to report, but the `.loading` set above is this
            // call's to undo — left there, the footer spins forever and no
            // later page is ever requested.
            guard epoch == generation else { return }
            settlePagingIfLoading()
        } catch {
            guard epoch == generation else { return }
            paging = .failed(RepositoryError.describing(error))
        }
    }

    private func show(_ transactions: [Transaction], nextCursor: String?) {
        cursor = nextCursor
        hasLoaded = true
        state = transactions.isEmpty ? .empty : .loaded(transactions)
        settlePaging()
    }

    private func show(merging incoming: [Transaction], nextCursor: String?) {
        show(rows(merging: incoming), nextCursor: nextCursor)
    }

    /// Appends the rows that are not already on screen.
    ///
    /// A well-behaved cursor never re-sends one, so this is a belt: a duplicate
    /// id renders as a duplicate row and confuses `ForEach`'s identity rather
    /// than raising anything, which is the class of defect that reaches
    /// production because nobody can tell it from a real repeated purchase.
    private func rows(merging incoming: [Transaction]) -> [Transaction] {
        guard case .loaded(let existing) = state else { return incoming }
        let seen = Set(existing.map(\.id))
        return existing + incoming.filter { !seen.contains($0.id) }
    }

    /// Puts the tail where the cursor says it belongs. A load that succeeded
    /// owns this outright: the list it replaced is gone, and so is anything the
    /// old tail was waiting for.
    private func settlePaging() {
        paging = cursor == nil ? .exhausted : .idle
    }

    /// Undoes a `.loading` that nothing is coming back to undo — a fetch a
    /// refresh superseded, or one that was cancelled.
    ///
    /// A tail that has **failed** is left exactly where it is. It is waiting for
    /// a tap, and some other request failing is not that tap: clearing it would
    /// put the footer back to `.idle`, where appearing is enough to fetch, and
    /// the row that provoked the failure is still on screen to do the
    /// appearing. That is the automatic retry ``retryNextPage()`` exists to
    /// prevent, arrived at sideways — and the gesture that triggers it is the
    /// one a person makes repeatedly when a refresh keeps failing.
    private func settlePagingIfLoading() {
        guard paging == .loading else { return }
        settlePaging()
    }
}
