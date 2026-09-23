import Foundation

/// The purchase records the phone can read.
public protocol PurchasesRepository: Sendable {
    /// Searches purchase and line matches, narrowed by settlement status on the server.
    func search(text: String, status: PurchaseSearchStatus) async throws -> [PurchaseSearchHit]

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
