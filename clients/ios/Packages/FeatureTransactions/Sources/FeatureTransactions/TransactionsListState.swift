import AppCore

/// What the transactions screen is showing, as one value the view switches on
/// rather than a handful of flags it has to combine correctly.
///
/// The pair that must never merge is ``empty`` and ``failed``. The BFM answers a
/// finance outage with a typed unavailable response precisely so this app can
/// tell "there is nothing" from "we could not ask" — collapsing them here would
/// throw that away and tell someone they have no transactions because a
/// container restarted.
public enum TransactionsListState: Hashable, Sendable {
    /// Nothing has arrived and nothing has failed.
    case loading
    /// A page arrived and it genuinely had no rows in it.
    case empty
    /// Nothing ever arrived. The screen *is* the failure, and it carries a
    /// retry. Only reachable before a first page lands: once there are rows to
    /// read, a later failure is reported beside them instead — see
    /// ``PagingState`` and ``TransactionsListViewModel/refreshFailure``.
    case failed(RepositoryError)
    /// Rows the user can read.
    case loaded([Transaction])
}

/// How the tail of the list is doing: whether there is more, whether more is on
/// its way, and whether the last attempt at more failed.
///
/// Separate from ``TransactionsListState`` because a paging failure must not
/// take the rows away. Discarding a screenful of transactions because the
/// eleventh page failed costs the reader everything they had and re-costs every
/// page on a cellular connection.
public enum PagingState: Hashable, Sendable {
    /// There is more to fetch and nothing is fetching it.
    case idle
    /// A page is in flight.
    case loading
    /// The last attempt failed. Retried only on purpose — see
    /// ``TransactionsListViewModel/retryNextPage()`` for why the scroll
    /// position that provoked the failure is not allowed to retry it.
    case failed(RepositoryError)
    /// The server handed back no next cursor. There is nothing more, and
    /// nothing further will be requested.
    case exhausted
}
