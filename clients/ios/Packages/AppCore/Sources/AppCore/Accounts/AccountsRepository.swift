import Foundation

/// Reading accounts, as the feature that renders them sees it.
public protocol AccountsRepository: Sendable {
    /// Every account this device can read, active and archived alike.
    func accounts() async throws -> [Account]

    /// One server-filtered account page.
    ///
    /// - Parameters:
    ///   - search: Search text matched against account name, institution or
    ///     contact, and the account kind label before the page limit is applied.
    ///   - archived: `false` for active accounts, `true` for archived accounts,
    ///     or `nil` for both.
    ///   - cursor: `nil` for the first page, otherwise the previous page's
    ///     opaque continuation token.
    ///   - limit: Maximum number of accounts in the page.
    func accountPage(
        search: String?,
        archived: Bool?,
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
    /// - Parameters: See ``AccountsRepository/accountPage(search:archived:cursor:limit:)``.
    public func accountPage(
        search: String?,
        archived: Bool?,
        cursor: String?,
        limit: Int
    ) async throws -> AccountsPage {
        guard limit > 0 else { throw RepositoryError.contractMismatch }

        let normalizedSearch = search?.trimmingCharacters(in: .whitespacesAndNewlines)
        let filtered = try await accounts().filter { account in
            guard archived.map({ account.archived == $0 }) ?? true else { return false }
            guard let normalizedSearch, !normalizedSearch.isEmpty else { return true }
            let kindLabel = account.kind.rawValue.replacingOccurrences(of: "-", with: " ")
            return [account.name, account.institutionName, account.contact, kindLabel]
                .compactMap { $0 }
                .contains { $0.localizedCaseInsensitiveContains(normalizedSearch) }
        }

        let offset: Int
        if let cursor {
            guard
                let data = Data(base64Encoded: cursor),
                let decoded = try? JSONDecoder().decode(AccountsRepositoryCursor.self, from: data),
                decoded.search == normalizedSearch,
                decoded.archived == archived
            else {
                throw RepositoryError.contractMismatch
            }
            guard let index = filtered.firstIndex(where: { $0.id == decoded.lastID }) else {
                throw RepositoryError.contractMismatch
            }
            offset = index + 1
        } else {
            offset = 0
        }

        guard offset >= 0, offset <= filtered.count else {
            throw RepositoryError.contractMismatch
        }
        let end = offset + min(limit, filtered.count - offset)
        let pageAccounts = Array(filtered[offset..<end])
        let nextCursor: String?
        if end < filtered.count {
            let token = AccountsRepositoryCursor(
                lastID: pageAccounts[pageAccounts.count - 1].id,
                search: normalizedSearch,
                archived: archived
            )
            nextCursor = try JSONEncoder().encode(token).base64EncodedString()
        } else {
            nextCursor = nil
        }

        return AccountsPage(
            accounts: pageAccounts,
            nextCursor: nextCursor,
            totalCount: filtered.count
        )
    }
}

private struct AccountsRepositoryCursor: Codable {
    let lastID: Account.ID
    let search: String?
    let archived: Bool?
}
