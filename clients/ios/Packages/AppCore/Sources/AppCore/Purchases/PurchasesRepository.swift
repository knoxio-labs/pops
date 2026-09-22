import Foundation

/// The purchase records the phone can read.
public protocol PurchasesRepository: Sendable {
    /// Reads one filtered page after an opaque cursor, or the first page when it is nil.
    func purchases(
        after cursor: String?, statusFilter: PurchaseStatusFilter
    ) async throws -> PurchasePage

    /// Reads aggregate purchase activity for the calendar month containing `month`.
    func monthSummary(for month: Date) async throws -> PurchasesMonthSummary
}
