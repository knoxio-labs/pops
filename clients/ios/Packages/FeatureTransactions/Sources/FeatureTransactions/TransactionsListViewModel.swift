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

    /// The next page's cursor, or `nil` when there is no next page. Opaque.
    private var cursor: String?

    /// Whether a first page has ever landed. What separates "still loading"
    /// from "loaded, and empty", and what stops ``loadFirstPage()`` refetching
    /// every time the view reappears.
    private var hasLoaded = false

    private var isFetchingPage = false
    private var isRefreshing = false

    /// Bumped by every refresh, so an older in-flight fetch can recognise that
    /// the list it was reading into has been replaced.
    private var generation = 0

    /// - Parameter dependencies: read for ``TransactionsRepository`` and
    ///   nothing else. The composition root is the only thing that knows what
    ///   is behind it.
    public init(dependencies: AppDependencies) {
        repository = dependencies.transactions
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
        guard !hasLoaded, !isFetchingPage, !isRefreshing else { return }

        state = .loading
        isFetchingPage = true
        defer { isFetchingPage = false }

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
    public func refresh() async {
        guard !isRefreshing else { return }

        isRefreshing = true
        generation += 1
        let epoch = generation
        defer { isRefreshing = false }

        do {
            let page = try await repository.transactions(after: nil)
            guard epoch == generation else { return }
            refreshFailure = nil
            show(page.transactions, nextCursor: page.nextCursor)
        } catch let error where error.isCancellation {
            guard epoch == generation else { return }
            settlePaging()
        } catch {
            guard epoch == generation else { return }
            refreshFailure = RepositoryError.describing(error)
            settlePaging()
        }
    }
}

extension TransactionsListViewModel {
    private func fetchNextPage() async {
        guard hasLoaded, !isFetchingPage, !isRefreshing, let cursor else { return }

        isFetchingPage = true
        paging = .loading
        defer { isFetchingPage = false }

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
            settlePaging()
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

    private func settlePaging() {
        paging = cursor == nil ? .exhausted : .idle
    }
}

extension RepositoryError {
    /// ``TransactionsRepository`` does not constrain what it throws, so a
    /// conforming implementation may throw anything. Everything unrecognised
    /// becomes ``RepositoryError/transport(_:)``, whose payload is a diagnostic
    /// and never reaches a screen.
    internal static func describing(_ error: Error) -> RepositoryError {
        error as? RepositoryError ?? .transport(String(describing: error))
    }
}

extension Error {
    /// A fetch cancelled because its view went away is not a failure to report.
    /// Recording one would leave the error state on a screen nobody is looking
    /// at, ready for the next person who navigates back to it.
    ///
    /// Both halves are needed. `CancellationError` is what Swift concurrency
    /// throws, but a repository built on URLSession surfaces the same event as
    /// `URLError(.cancelled)` wrapped in whatever its layers wrap things in —
    /// and this module may not name any of those types. `Task.isCancelled` at
    /// the catch site answers the question those types were only evidence for:
    /// is the work that produced this error still wanted.
    fileprivate var isCancellation: Bool {
        Task.isCancelled || self is CancellationError
    }
}
