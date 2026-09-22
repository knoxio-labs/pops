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
    private var details: [Purchase.ID: PurchaseDetail]
    private let receipts: [String: ReceiptImage]

    private struct CursorRecord {
        let offset: Int
        let statusFilter: PurchaseStatusFilter
    }

    /// Creates a repository whose pages contain at most `pageSize` purchases.
    public init(
        rows: [Purchase] = [],
        pageSize: Int = 5,
        summary: PurchasesMonthSummary = .empty,
        details: [PurchaseDetail] = [],
        receipts: [String: ReceiptImage] = [:]
    ) {
        self.rows = rows
        self.pageSize = max(1, pageSize)
        self.summary = summary
        self.details = Dictionary(uniqueKeysWithValues: details.map { ($0.id, $0) })
        self.receipts = receipts
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
        try beginCall()

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
        try beginCall()
        return summary
    }

    public func purchaseDetail(id: Purchase.ID) async throws -> PurchaseDetail? {
        try beginCall()
        return details[id]
    }

    public func updatePurchase(
        id: Purchase.ID, _ update: PurchaseUpdate
    ) async throws -> PurchaseDetail? {
        try beginCall()
        guard let current = details[id] else { return nil }

        let currency = current.purchase.total.currencyCode
        let lines = update.lines.enumerated().map { index, line in
            PurchaseDetailLine(
                id: line.id ?? "fake-line-\(callCount)-\(index)",
                name: line.name,
                quantity: line.quantity,
                lineTotal: MoneyAmount(
                    minorUnits: line.lineTotalCents, currencyCode: currency))
        }
        let purchase = Purchase(
            id: current.id,
            merchant: updatedMerchant(current.purchase.merchant, with: update),
            orderedOn: update.orderedAt ?? current.purchase.orderedOn,
            total: MoneyAmount(
                minorUnits: update.totalCents ?? current.purchase.total.minorUnits,
                currencyCode: currency),
            itemCount: lines.reduce(0) { $0 + $1.quantity },
            receiptURI: current.purchase.receiptURI,
            status: current.purchase.status
        )
        let updated = PurchaseDetail(
            purchase: purchase,
            subtotal: updatedMoney(update.subtotalCents, preserving: current.subtotal),
            tax: updatedMoney(update.taxCents, preserving: current.tax),
            shipping: updatedMoney(update.shippingCents, preserving: current.shipping),
            discount: updatedMoney(update.discountCents, preserving: current.discount),
            surcharge: updatedMoney(update.surchargeCents, preserving: current.surcharge),
            source: current.source,
            lines: lines,
            receiptURIs: current.receiptURIs,
            edit: current.edit,
            updatedAt: current.updatedAt
        )
        details[id] = updated
        if let index = rows.firstIndex(where: { $0.id == id }) {
            rows[index] = purchase
        }
        return updated
    }

    public func receiptThumbnail(sha256: String) async throws -> ReceiptImage? {
        try beginCall()
        return receipts[sha256]
    }

    public func receiptImage(sha256: String) async throws -> ReceiptImage? {
        try beginCall()
        return receipts[sha256]
    }

    private func beginCall() throws {
        callCount += 1
        if let failure = failures[callCount] { throw failure }
    }

    private func updatedMoney(_ minorUnits: Int?, preserving current: MoneyAmount) -> MoneyAmount {
        MoneyAmount(
            minorUnits: minorUnits ?? current.minorUnits,
            currencyCode: current.currencyCode)
    }

    private func updatedMerchant(
        _ current: MerchantIdentity, with update: PurchaseUpdate
    ) -> MerchantIdentity {
        if let id = update.merchantEntityID {
            let name = update.merchantEntityName ?? current.displayName ?? id
            return .entity(id: id, name: name, printed: name)
        }
        if let name = update.merchantEntityName {
            return .printed(name)
        }
        return current
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
