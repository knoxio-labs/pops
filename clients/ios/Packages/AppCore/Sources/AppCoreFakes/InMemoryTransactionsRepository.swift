import AppCore

/// A ``TransactionsRepository`` backed by an array, so a feature's tests never
/// stub a URL protocol.
///
/// An actor rather than a locked class: the call count is the thing tests
/// assert on, and it has to still be right when twenty requests race.
public actor InMemoryTransactionsRepository: TransactionsRepository {
    public private(set) var callCount = 0

    private var rows: [Transaction]
    private let pageSize: Int
    private var failures: [Int: RepositoryError] = [:]

    /// - Parameter pageSize: how many rows a page carries. Small by default so
    ///   a test can exercise several pages without inventing hundreds of rows.
    public init(rows: [Transaction] = [], pageSize: Int = 2) {
        self.rows = rows
        self.pageSize = max(1, pageSize)
    }

    /// Replaces the backing rows, which is what a refresh reads afterwards.
    public func replace(with rows: [Transaction]) {
        self.rows = rows
    }

    /// Fails the `call`-th call (1-based) with `error`, for the failure that
    /// only happens partway through a scroll.
    public func fail(onCall call: Int, with error: RepositoryError) {
        failures[call] = error
    }

    public func transactions(after cursor: String?) async throws -> TransactionPage {
        callCount += 1
        if let failure = failures[callCount] { throw failure }

        let start = try offset(for: cursor)
        let end = min(start + pageSize, rows.count)
        return TransactionPage(
            transactions: Array(rows[start..<end]),
            nextCursor: end < rows.count ? String(end) : nil
        )
    }

    /// The cursor is opaque to callers, so a value this fake never minted is
    /// the same mistake as a real client inventing one: a contract mismatch.
    private func offset(for cursor: String?) throws -> Int {
        guard let cursor else { return 0 }
        guard let offset = Int(cursor), offset >= 0, offset <= rows.count else {
            throw RepositoryError.contractMismatch
        }
        return offset
    }
}
