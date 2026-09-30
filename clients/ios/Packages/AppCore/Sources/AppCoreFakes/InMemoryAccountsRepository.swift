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
    public private(set) var pageRequests:
        [(search: String?, archived: Bool?, cursor: String?, limit: Int)] = []

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
        archived: Bool?,
        cursor: String?,
        limit: Int
    ) async throws -> AccountsPage {
        callCount += 1
        pageRequests.append((search, archived, cursor, limit))
        if let failure { throw failure }
        guard limit > 0 else { throw RepositoryError.contractMismatch }

        let normalizedSearch = search?.trimmingCharacters(in: .whitespacesAndNewlines)
        let filtered = rows.filter { account in
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
        let nextCursor: String?
        if end < filtered.count {
            nextCursor = try JSONEncoder().encode(
                AccountsRepositoryCursor(
                    lastID: filtered[end - 1].id,
                    search: normalizedSearch,
                    archived: archived
                )
            ).base64EncodedString()
        } else {
            nextCursor = nil
        }

        return AccountsPage(
            accounts: Array(filtered[offset..<end]),
            nextCursor: nextCursor,
            totalCount: filtered.count
        )
    }

    public func accountDetail(id: Account.ID) async throws -> AccountDetail? {
        detailCallCount += 1
        if let failure = detailFailures[id] { throw failure }
        return details[id]
    }
}

private struct AccountsRepositoryCursor: Codable {
    let lastID: Account.ID
    let search: String?
    let archived: Bool?
}
