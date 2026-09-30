import AppCore
import Foundation

/// An ``AccountsRepository`` backed by arrays, so a feature's tests never stub
/// a URL protocol.
///
/// An actor rather than a locked class: the call counts are what tests assert
/// on, and they have to still be right when requests race.
public actor InMemoryAccountsRepository: AccountsRepository {
    /// Number of full-list, page, and detail calls made to this repository.
    public private(set) var callCount = 0

    /// The search, archive scope, cursor, and limit used for each page request.
    public private(set) var pageRequests: [InMemoryAccountsPageRequest] = []

    /// Number of account-detail calls made to this repository.
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

    /// Fails every subsequent list and page call with `error`. `nil` clears it,
    /// which is what a retry after a fixed outage needs.
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

    /// Reads one page after applying search and archive filters.
    public func accountPage(
        search: String?,
        archiveScope: AccountsArchiveScope,
        cursor: String?,
        limit: Int
    ) async throws -> AccountsPage {
        callCount += 1
        pageRequests.append(
            InMemoryAccountsPageRequest(
                search: search, archiveScope: archiveScope, cursor: cursor, limit: limit))
        if let failure { throw failure }
        guard limit > 0 else { throw RepositoryError.contractMismatch }

        let normalizedSearch = search?.trimmingCharacters(in: .whitespacesAndNewlines)
        let filtered = matchingRows(search: normalizedSearch, archiveScope: archiveScope)
        let offset = try accountPageOffset(
            cursor, in: filtered, search: normalizedSearch, archiveScope: archiveScope)
        return try makeAccountPage(
            from: filtered,
            offset: offset,
            limit: limit,
            search: normalizedSearch,
            archiveScope: archiveScope
        )
    }

    private func matchingRows(search: String?, archiveScope: AccountsArchiveScope) -> [Account] {
        rows.filter { account in
            guard archiveScope.includes(account) else { return false }
            guard let search, !search.isEmpty else { return true }
            let kindLabel = account.kind.rawValue.replacingOccurrences(of: "-", with: " ")
            return [account.name, account.institutionName, account.contact, kindLabel]
                .compactMap { $0 }
                .contains { $0.localizedCaseInsensitiveContains(search) }
        }
    }

    private func accountPageOffset(
        _ cursor: String?,
        in accounts: [Account],
        search: String?,
        archiveScope: AccountsArchiveScope
    ) throws -> Int {
        guard let cursor else { return 0 }
        guard
            let data = Data(base64Encoded: cursor),
            let decoded = try? JSONDecoder().decode(AccountsRepositoryCursor.self, from: data),
            decoded.search == search,
            decoded.archiveScope == archiveScope,
            let index = accounts.firstIndex(where: { $0.id == decoded.lastID })
        else {
            throw RepositoryError.contractMismatch
        }
        return index + 1
    }

    private func makeAccountPage(
        from accounts: [Account],
        offset: Int,
        limit: Int,
        search: String?,
        archiveScope: AccountsArchiveScope
    ) throws -> AccountsPage {
        guard offset <= accounts.count else { throw RepositoryError.contractMismatch }
        let end = offset + min(limit, accounts.count - offset)
        let pageAccounts = Array(accounts[offset..<end])
        let nextCursor =
            try end < accounts.count
            ? JSONEncoder().encode(
                AccountsRepositoryCursor(
                    lastID: pageAccounts[pageAccounts.count - 1].id,
                    search: search,
                    archiveScope: archiveScope
                )
            ).base64EncodedString()
            : nil
        return AccountsPage(
            accounts: pageAccounts, nextCursor: nextCursor, totalCount: accounts.count)
    }

    public func accountDetail(id: Account.ID) async throws -> AccountDetail? {
        detailCallCount += 1
        if let failure = detailFailures[id] { throw failure }
        return details[id]
    }
}

/// One account page request recorded by ``InMemoryAccountsRepository``.
public struct InMemoryAccountsPageRequest: Hashable, Sendable {
    /// Search term sent to the repository.
    public let search: String?

    /// Account archive subset sent to the repository.
    public let archiveScope: AccountsArchiveScope

    /// Cursor sent to the repository, or `nil` for its first page.
    public let cursor: String?

    /// Maximum number of rows requested.
    public let limit: Int
}

private struct AccountsRepositoryCursor: Codable {
    let lastID: Account.ID
    let search: String?
    let archiveScope: AccountsArchiveScope
}
