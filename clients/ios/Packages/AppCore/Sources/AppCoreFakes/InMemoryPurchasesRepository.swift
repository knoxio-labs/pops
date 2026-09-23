import AppCore
import Foundation

/// A ``PurchasesRepository`` backed by an array, with server-shaped paging and failures.
public actor InMemoryPurchasesRepository: PurchasesRepository {
    public private(set) var callCount = 0
    public private(set) var searchCalls: [(text: String, status: PurchaseSearchStatus)] = []

    private var rows: [Purchase]
    private let hits: [PurchaseSearchHit]
    private let searchDelay: Duration
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
        hits: [PurchaseSearchHit] = [],
        searchDelay: Duration = .zero,
        pageSize: Int = 5,
        summary: PurchasesMonthSummary = .empty,
        details: [PurchaseDetail] = [],
        receipts: [String: ReceiptImage] = [:]
    ) {
        self.rows = rows
        self.hits = hits
        self.searchDelay = searchDelay
        self.pageSize = max(1, pageSize)
        self.summary = summary
        self.details = Dictionary(uniqueKeysWithValues: details.map { ($0.id, $0) })
        self.receipts = receipts
    }

    public func search(
        text: String, status: PurchaseSearchStatus
    ) async throws -> [PurchaseSearchHit] {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return [] }
        searchCalls.append((text, status))
        try beginCall()
        try await Task.sleep(for: searchDelay)
        return hits.filter { hit in
            searchHit(hit, matches: status) && searchHit(hit, matches: text)
        }
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
        let lines = updatedLines(from: update, preserving: current.lines, currency: currency)
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

    private func updatedLines(
        from update: PurchaseUpdate,
        preserving current: [PurchaseDetailLine],
        currency: String
    ) -> [PurchaseDetailLine] {
        let currentByID = Dictionary(uniqueKeysWithValues: current.map { ($0.id, $0) })
        return update.lines.enumerated().map { index, line in
            PurchaseDetailLine(
                id: line.id ?? "fake-line-\(callCount)-\(index)",
                name: line.name,
                quantity: line.quantity,
                lineTotal: MoneyAmount(
                    minorUnits: line.lineTotalCents, currencyCode: currency),
                hasInventoryLink: line.id.flatMap { currentByID[$0]?.hasInventoryLink } ?? false)
        }
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

private func searchHit(_ hit: PurchaseSearchHit, matches status: PurchaseSearchStatus) -> Bool {
    switch status {
    case .any: true
    case .unmatched: hit.order.status == .awaitingSettlement
    case .matched: hit.order.status == .linked
    case .partial: hit.order.status == .partial
    case .cash: hit.order.status == .settledCash
    case .ignored: hit.order.status == .ignored
    }
}

private func searchHit(_ hit: PurchaseSearchHit, matches text: String) -> Bool {
    let needle = text.trimmingCharacters(in: .whitespacesAndNewlines)
    return searchableValues(for: hit).contains { $0.localizedCaseInsensitiveContains(needle) }
}

private func searchableValues(for hit: PurchaseSearchHit) -> [String] {
    switch hit {
    case .purchase(let order, let printedMatch):
        merchantNames(order.merchant) + [printedMatch].compactMap { $0 }
    case .line(_, let name, _, _, let order, let tagMatch):
        [name] + merchantNames(order.merchant) + [tagMatch].compactMap { $0 }
    }
}

private func merchantNames(_ merchant: MerchantIdentity) -> [String] {
    switch merchant {
    case .entity(_, let name, let printed): [name, printed]
    case .printed(let printed): [printed]
    case .unattributed: []
    }
}
