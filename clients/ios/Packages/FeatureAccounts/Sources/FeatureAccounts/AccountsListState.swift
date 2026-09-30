import AppCore

/// What the accounts screen is showing, as one value the view switches on.
///
/// The pair that must never merge is ``empty`` and ``failed`` — the same
/// distinction `TransactionsListState` draws, and for the same reason: an
/// unreachable finance pillar must never render as "you have no accounts".
public enum AccountsListState: Hashable, Sendable {
    /// Nothing has arrived and nothing has failed.
    case loading
    /// The current account scope answered with no rows. A search with no
    /// matches is instead represented by ``loaded(_:)`` with an empty array.
    case empty
    /// Nothing ever arrived. The screen *is* the failure, and it carries a
    /// retry.
    case failed(RepositoryError)
    /// The accounts currently loaded for this search and archive scope. An
    /// An empty array with non-empty search text means no matches; `.empty`
    /// means the current archive scope contained no rows.
    case loaded([Account])
}
