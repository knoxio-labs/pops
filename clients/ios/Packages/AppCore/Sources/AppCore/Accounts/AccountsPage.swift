/// The archive subset to include in an account page.
public enum AccountsArchiveScope: String, Codable, Hashable, Sendable {
    /// Include active and archived accounts.
    case all

    /// Include only accounts that are not archived.
    case active

    /// Include only archived accounts.
    case archived

    /// Whether an account belongs to this archive subset.
    ///
    /// - Parameter account: Account to compare with this scope.
    public func includes(_ account: Account) -> Bool {
        switch self {
        case .all: true
        case .active: !account.archived
        case .archived: account.archived
        }
    }
}

/// One cursor-paginated account result and the continuation for the next page.
public struct AccountsPage: Hashable, Sendable {
    /// Rows in this page, ordered as the repository returns them.
    public let accounts: [Account]

    /// `nil` on the last page. Opaque and returned unchanged by the server.
    public let nextCursor: String?

    /// Number of accounts matching the page's search and archive filters.
    public let totalCount: Int?

    /// Creates a page returned by an ``AccountsRepository``.
    public init(accounts: [Account], nextCursor: String?, totalCount: Int? = nil) {
        self.accounts = accounts
        self.nextCursor = nextCursor
        self.totalCount = totalCount
    }
}
