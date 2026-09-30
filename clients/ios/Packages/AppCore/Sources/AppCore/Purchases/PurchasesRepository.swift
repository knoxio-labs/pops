import Foundation

/// The purchase records the phone can read.
public protocol PurchasesRepository: Sendable {
    /// Searches purchase and line matches in one bounded page. The server applies the query's text,
    /// kind, status, and, when non-empty, any-of tag predicates before the page limit. `after` is an
    /// opaque cursor from the preceding page; pass `nil` for the first page. Blank text matches
    /// nothing and sends no request.
    func search(
        query: PurchaseSearchQuery, after cursor: String?, limit: Int
    ) async throws -> PurchaseSearchPage

    /// Reads one page of item tags in use across purchase lines, in the server's most-used-first
    /// order. The server applies `search` before the page limit; `after` is an opaque cursor from
    /// the preceding page, or `nil` for the first page.
    func purchaseTags(search: String, after cursor: String?, limit: Int) async throws
        -> PurchaseTagPage

    /// Reads one filtered page after an opaque cursor, or the first page when it is nil.
    func purchases(
        after cursor: String?, statusFilter: PurchaseStatusFilter
    ) async throws -> PurchasePage

    /// Reads aggregate purchase activity for the calendar month containing `month`.
    func monthSummary(for month: Date) async throws -> PurchasesMonthSummary

    /// Reads a purchase detail, or returns `nil` when the purchase does not exist.
    func purchaseDetail(id: Purchase.ID) async throws -> PurchaseDetail?

    /// Replaces the editable values and complete desired line set, or returns `nil` when the
    /// purchase no longer exists.
    func updatePurchase(id: Purchase.ID, _ update: PurchaseUpdate) async throws -> PurchaseDetail?

    /// Reads a receipt thumbnail, or returns `nil` when it is absent or cannot be thumbnailed.
    func receiptThumbnail(sha256: String) async throws -> ReceiptImage?

    /// Reads a full-size receipt, or returns `nil` when it does not exist.
    func receiptImage(sha256: String) async throws -> ReceiptImage?
}
