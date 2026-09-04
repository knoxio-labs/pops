import AppCore

/// What the account dashboard is showing, as one value the view switches on —
/// the same shape `TransactionDetailState` takes, and the same reasoning for
/// each case.
public enum AccountDetailState: Hashable, Sendable {
    /// Nothing to draw yet. Reached only when the screen opened without the
    /// row the list already had.
    case loading
    /// The row the list handed over, drawn while the fuller record — history,
    /// a kind's facts, recent transactions — is fetched.
    case seeded(Account)
    /// The fuller record.
    case loaded(AccountDetail)
    /// Finance no longer has this account.
    case notFound
    /// Nothing ever arrived and the request failed.
    case failed(RepositoryError)
}

extension AccountDetailState {
    /// Whether there is something on screen a failure must not take away.
    internal var hasContent: Bool {
        switch self {
        case .seeded, .loaded:
            return true
        case .loading, .notFound, .failed:
            return false
        }
    }
}
