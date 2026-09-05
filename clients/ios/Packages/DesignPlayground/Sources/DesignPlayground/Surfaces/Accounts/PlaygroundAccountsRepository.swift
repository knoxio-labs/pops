import AppCore

/// One way the whole-list fetch can answer. Unlike
/// ``TransactionPageOutcome`` there is no paging to model — ``AccountsRepository``
/// says the list is small enough to fetch whole — so the only shapes are a
/// list, a thrown error, or a fetch that never lands.
internal enum AccountsOutcome: Sendable {
    case list([Account])
    case failure(RepositoryError)
    /// Never answers, so a design state built on it holds still on whatever is
    /// already on screen. See ``TransactionPageOutcome/stalls`` for why this is
    /// a fetch nobody resumes rather than a value nobody supplied.
    case stalls
}

/// One way the detail fetch can answer — the same three shapes as
/// ``TransactionDetailOutcome``, and the same reason `nil` and ``stalls`` are
/// kept apart: `nil` is finance saying the account is gone, ``stalls`` is a
/// fetch still in flight over whatever the list already handed the screen.
internal enum AccountDetailOutcome: Sendable {
    case detail(AccountDetail?)
    case failure(RepositoryError)
    case stalls
}

/// An ``AccountsRepository`` built entirely from literals, for staging one
/// screen state at a time. Never reaches a network — everything it can say is
/// decided by the ``AccountsOutcome`` and ``AccountDetailOutcome`` values it
/// was configured with.
internal struct PlaygroundAccountsRepository: AccountsRepository {
    private let outcome: AccountsOutcome
    private let detail: AccountDetailOutcome

    internal init(
        outcome: AccountsOutcome = .list([]),
        detail: AccountDetailOutcome = .detail(nil)
    ) {
        self.outcome = outcome
        self.detail = detail
    }

    internal func accounts() async throws -> [Account] {
        switch outcome {
        case .list(let accounts):
            return accounts
        case .failure(let error):
            throw error
        case .stalls:
            try await Task.sleep(for: .seconds(3600))
            return []
        }
    }

    internal func accountDetail(id: Account.ID) async throws -> AccountDetail? {
        switch detail {
        case .detail(let record):
            return record
        case .failure(let error):
            throw error
        case .stalls:
            try await Task.sleep(for: .seconds(3600))
            return nil
        }
    }
}
