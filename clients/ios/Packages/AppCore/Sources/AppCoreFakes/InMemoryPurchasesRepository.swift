import AppCore

/// A ``PurchasesRepository`` backed by an array, with server-shaped paging and failures.
public actor InMemoryPurchasesRepository: PurchasesRepository {
    public private(set) var callCount = 0

    private var rows: [Purchase]
    private let pageSize: Int
    private var failures: [Int: RepositoryError] = [:]
    private var mintedCursors: Set<String> = []

    /// Creates a repository whose pages contain at most `pageSize` purchases.
    public init(rows: [Purchase] = [], pageSize: Int = 5) {
        self.rows = rows
        self.pageSize = max(1, pageSize)
    }

    /// Replaces the rows and invalidates cursors minted for the previous list.
    public func replace(with rows: [Purchase]) {
        self.rows = rows
        mintedCursors = []
    }

    /// Fails the `call`-th request, numbered from one, with `error`.
    public func fail(onCall call: Int, with error: RepositoryError) {
        failures[call] = error
    }

    public func purchases(after cursor: String?) async throws -> PurchasePage {
        callCount += 1
        if let failure = failures[callCount] { throw failure }

        let start = try offset(for: cursor)
        let end = min(start + pageSize, rows.count)
        guard end < rows.count else {
            return PurchasePage(purchases: Array(rows[start..<end]), nextCursor: nil)
        }

        let nextCursor = String(end)
        mintedCursors.insert(nextCursor)
        return PurchasePage(purchases: Array(rows[start..<end]), nextCursor: nextCursor)
    }

    private func offset(for cursor: String?) throws -> Int {
        guard let cursor else { return 0 }
        guard mintedCursors.contains(cursor), let offset = Int(cursor), offset <= rows.count else {
            throw RepositoryError.contractMismatch
        }
        return offset
    }
}
