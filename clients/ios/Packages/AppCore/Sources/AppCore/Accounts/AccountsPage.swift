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
