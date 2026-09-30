import Foundation

/// Reading accounts, as the feature that renders them sees it.
public protocol AccountsRepository: Sendable {
    /// Every account this device can read, active and archived alike.
    func accounts() async throws -> [Account]

    /// One server-filtered account page.
    ///
    /// - Parameters:
    ///   - search: Text the repository matches before applying the page limit.
    ///   - archiveScope: The active, archived, or combined account subset.
    ///   - cursor: `nil` for the first page, otherwise the previous page's
    ///     opaque continuation token.
    ///   - limit: Maximum number of accounts in the page.
    func accountPage(
        search: String?,
        archiveScope: AccountsArchiveScope,
        cursor: String?,
        limit: Int
    ) async throws -> AccountsPage

    /// The fuller record behind one account's dashboard.
    ///
    /// - Returns: `nil` when finance no longer has it — the same reasoning as
    ///   ``TransactionsRepository/transactionDetail(id:)``: an account archived
    ///   or removed between a list arriving and somebody opening it is an
    ///   ordinary outcome, not a failure to retry.
    func accountDetail(id: Account.ID) async throws -> AccountDetail?
}

extension AccountsRepository {
    /// Supplies cursor pages for local repositories that still expose a full
    /// account array. Network repositories implement this with server paging.
    ///
    /// - Parameters: See ``AccountsRepository/accountPage(search:archiveScope:cursor:limit:)``.
    public func accountPage(
        search: String?,
        archiveScope: AccountsArchiveScope,
        cursor: String?,
        limit: Int
    ) async throws -> AccountsPage {
        guard limit > 0 else { throw RepositoryError.contractMismatch }

        let normalizedSearch = search?.trimmingCharacters(in: .whitespacesAndNewlines)
        let filtered = filterAccounts(
            try await accounts(), search: normalizedSearch, archiveScope: archiveScope)
        let offset = try accountPageOffset(
            cursor, in: filtered, search: normalizedSearch, archiveScope: archiveScope)
        return try makeAccountsPage(
            from: filtered,
            offset: offset,
            limit: limit,
            search: normalizedSearch,
            archiveScope: archiveScope
        )
    }
}

private struct AccountsRepositoryCursor: Codable {
    let lastID: Account.ID
    let search: String?
    let archiveScope: AccountsArchiveScope
}

private func filterAccounts(
    _ accounts: [Account],
    search: String?,
    archiveScope: AccountsArchiveScope
) -> [Account] {
    accounts.filter { account in
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

private func makeAccountsPage(
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
