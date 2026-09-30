import AppCore
import Foundation

extension InMemoryPurchasesRepository {
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
        let start = try purchaseOffset(
            for: cursor, statusFilter: statusFilter, count: filteredRows.count)
        let end = min(start + pageSize, filteredRows.count)
        let totalCount = cursor == nil ? filteredRows.count : nil
        let nextCursor: String?
        if end < filteredRows.count {
            let minted = mintCursor(prefix: "purchase-cursor")
            mintedCursors[minted] = CursorRecord(offset: end, statusFilter: statusFilter)
            nextCursor = minted
        } else {
            nextCursor = nil
        }
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
            updatedAt: current.updatedAt,
            accounting: current.accounting,
            charges: current.charges
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

    private func purchaseOffset(
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
}
