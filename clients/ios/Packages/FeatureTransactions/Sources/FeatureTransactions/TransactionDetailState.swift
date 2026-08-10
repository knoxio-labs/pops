import AppCore

/// What the detail screen is showing, as one value the view switches on.
///
/// The pair that must never merge here is ``notFound`` and ``failed``. A
/// transaction deleted between a list arriving and somebody tapping it is the
/// system working correctly; a fetch that failed is not. Rendering the first as
/// the second offers a retry against an answer that will not change, and
/// rendering the second as the first tells somebody their money is gone because
/// a container restarted.
public enum TransactionDetailState: Hashable, Sendable {
    /// Nothing to draw yet. Reached only when the screen was opened without the
    /// row the list already had — a cold launch into a restored route, or a tap
    /// on a row a refresh has since dropped.
    case loading
    /// The row the list handed over, drawn while the fuller record is fetched.
    /// Every word of it is real; there is simply more to come.
    case seeded(Transaction)
    /// The fuller record.
    case loaded(TransactionDetail)
    /// Finance no longer has this transaction. Carries no retry, because there
    /// is nothing retrying would find.
    case notFound
    /// Nothing ever arrived and the request failed. The screen *is* the
    /// failure and it carries a retry. Only reachable while there is nothing
    /// readable on screen: once there is, a failure is reported beside it — see
    /// ``TransactionDetailViewModel/failure``.
    case failed(RepositoryError)
}

extension TransactionDetailState {
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
