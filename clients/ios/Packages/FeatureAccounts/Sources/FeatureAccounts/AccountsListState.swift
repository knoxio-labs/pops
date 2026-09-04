import AppCore

/// What the accounts screen is showing, as one value the view switches on.
///
/// The pair that must never merge is ``empty`` and ``failed`` — the same
/// distinction `TransactionsListState` draws, and for the same reason: an
/// unreachable finance pillar must never render as "you have no accounts".
public enum AccountsListState: Hashable, Sendable {
    /// Nothing has arrived and nothing has failed.
    case loading
    /// A fetch answered and it genuinely held no accounts at all — not "none
    /// matched a search", which is a fact the sectioning owns, not the state.
    case empty
    /// Nothing ever arrived. The screen *is* the failure, and it carries a
    /// retry.
    case failed(RepositoryError)
    /// Every account this device can read, active and archived alike. What the
    /// screen shows of them — which sections, whether archived ones are
    /// visible, what a search narrowed away — is a presentation decision made
    /// over this value, not a second state.
    case loaded([Account])
}
