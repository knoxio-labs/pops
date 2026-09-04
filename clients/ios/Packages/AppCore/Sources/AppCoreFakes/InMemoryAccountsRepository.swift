import AppCore

/// An ``AccountsRepository`` backed by arrays, so a feature's tests never stub
/// a URL protocol.
///
/// An actor rather than a locked class: the call counts are what tests assert
/// on, and they have to still be right when requests race.
public actor InMemoryAccountsRepository: AccountsRepository {
    public private(set) var callCount = 0
    public private(set) var detailCallCount = 0

    private var rows: [Account]
    private var details: [Account.ID: AccountDetail]
    private var failure: RepositoryError?
    private var detailFailures: [Account.ID: RepositoryError] = [:]

    /// - Parameters:
    ///   - details: the fuller records, by the account they belong to. An
    ///     account with no entry here is one finance no longer has, which is
    ///     the not-found case.
    public init(
        rows: [Account] = [],
        details: [AccountDetail] = []
    ) {
        self.rows = rows
        self.details = Dictionary(uniqueKeysWithValues: details.map { ($0.account.id, $0) })
    }

    /// Replaces the backing rows, which is what a refresh reads afterwards.
    public func replace(with rows: [Account]) {
        self.rows = rows
    }

    /// Fails every subsequent call to ``accounts()`` with `error`. `nil` clears
    /// it, which is what a retry after a fixed outage needs.
    public func fail(with error: RepositoryError?) {
        failure = error
    }

    /// Fails ``accountDetail(id:)`` for one account, without disturbing any
    /// other.
    public func failDetail(for id: Account.ID, with error: RepositoryError) {
        detailFailures[id] = error
    }

    public func accounts() async throws -> [Account] {
        callCount += 1
        if let failure { throw failure }
        return rows
    }

    public func accountDetail(id: Account.ID) async throws -> AccountDetail? {
        detailCallCount += 1
        if let failure = detailFailures[id] { throw failure }
        return details[id]
    }
}
