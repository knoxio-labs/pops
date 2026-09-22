import AppCore
import Foundation

/// A ``PurchasesRepository`` backed by an array, with server-shaped paging and failures.
public actor InMemoryPurchasesRepository: PurchasesRepository {
    public private(set) var callCount = 0

    private var rows: [Purchase]
    private let pageSize: Int
    private var failures: [Int: RepositoryError] = [:]
    private var mintedCursors: [String: CursorRecord] = [:]
    private var nextCursorID = 0
    private let summary: PurchasesMonthSummary

    private struct CursorRecord {
        let offset: Int
        let statusFilter: PurchaseStatusFilter
    }

    /// Creates a repository whose pages contain at most `pageSize` purchases.
    public init(
        rows: [Purchase] = [],
        pageSize: Int = 5,
        summary: PurchasesMonthSummary = .empty
    ) {
        self.rows = rows
        self.pageSize = max(1, pageSize)
        self.summary = summary
    }

    /// Replaces the rows and invalidates cursors minted for the previous list.
    public func replace(with rows: [Purchase]) {
        self.rows = rows
        mintedCursors = [:]
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

        nextCursorID += 1
        let nextCursor = "purchase-cursor-\(nextCursorID)"
        mintedCursors[nextCursor] = CursorRecord(offset: end, statusFilter: statusFilter)
        return PurchasePage(
            purchases: Array(filteredRows[start..<end]), nextCursor: nextCursor,
            totalCount: totalCount)
    }

    public func monthSummary(for month: Date) async throws -> PurchasesMonthSummary {
        callCount += 1
        if let failure = failures[callCount] { throw failure }
        return summary
    }

    private func offset(
        for cursor: String?, statusFilter: PurchaseStatusFilter, count: Int
    ) throws -> Int {
        guard let cursor else { return 0 }
        guard let minted = mintedCursors[cursor], minted.statusFilter == statusFilter,
            minted.offset <= count
        else {
            throw RepositoryError.contractMismatch
        }
        return minted.offset
    }
}
