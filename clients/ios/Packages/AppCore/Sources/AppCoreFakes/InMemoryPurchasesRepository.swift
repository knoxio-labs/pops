import AppCore

/// A ``PurchasesRepository`` backed by an array, with server-shaped paging and failures.
public actor InMemoryPurchasesRepository: PurchasesRepository {
    public private(set) var callCount = 0

    private var rows: [Purchase]
    private let pageSize: Int
    private var failures: [Int: RepositoryError] = [:]
    private var mintedCursors: Set<MintedCursor> = []

    private struct MintedCursor: Hashable {
        let value: String
        let statusFilter: PurchaseStatusFilter
    }

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

    public func purchases(
        after cursor: String?, statusFilter: PurchaseStatusFilter
    ) async throws -> PurchasePage {
        callCount += 1
        if let failure = failures[callCount] { throw failure }

        let filteredRows = rows.filter { purchase in
            switch statusFilter {
            case .all: true
            case .unsettled: purchase.status.isUnsettled
            }
        }
        let start = try offset(for: cursor, statusFilter: statusFilter, count: filteredRows.count)
        let end = min(start + pageSize, filteredRows.count)
        let totalCount = cursor == nil ? filteredRows.count : nil
        guard end < filteredRows.count else {
            return PurchasePage(
                purchases: Array(filteredRows[start..<end]), nextCursor: nil,
                totalCount: totalCount)
        }

        let nextCursor = String(end)
        mintedCursors.insert(MintedCursor(value: nextCursor, statusFilter: statusFilter))
        return PurchasePage(
            purchases: Array(filteredRows[start..<end]), nextCursor: nextCursor,
            totalCount: totalCount)
    }

    private func offset(
        for cursor: String?, statusFilter: PurchaseStatusFilter, count: Int
    ) throws -> Int {
        guard let cursor else { return 0 }
        let minted = MintedCursor(value: cursor, statusFilter: statusFilter)
        guard mintedCursors.contains(minted), let offset = Int(cursor), offset <= count else {
            throw RepositoryError.contractMismatch
        }
        return offset
    }
}
