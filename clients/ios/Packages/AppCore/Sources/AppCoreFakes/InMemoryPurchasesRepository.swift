import AppCore
import Foundation

/// A ``PurchasesRepository`` backed by an array, with server-shaped paging and failures.
public actor InMemoryPurchasesRepository: PurchasesRepository {
    /// One call recorded by ``InMemoryPurchasesRepository/search(text:kind:status:tags:after:limit:)``.
    public struct SearchCall: Equatable, Sendable {
        public let text: String
        public let kind: PurchaseSearchKind
        public let status: PurchaseSearchStatus
        public let tags: Set<String>
        public let cursor: String?
        public let limit: Int
    }

    /// One call recorded by ``InMemoryPurchasesRepository/purchaseTags(search:after:limit:)``.
    public struct TagsCall: Equatable, Sendable {
        public let search: String
        public let cursor: String?
        public let limit: Int
    }

    public private(set) var callCount = 0
    public private(set) var searchCalls: [SearchCall] = []
    public private(set) var tagsCalls: [TagsCall] = []

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
    private let tagsInUse: [PurchaseTagCount]
    private var mintedSearchCursors: [String: SearchCursorRecord] = [:]
    private var mintedTagCursors: [String: TagsCursorRecord] = [:]

    private struct CursorRecord {
        let offset: Int
        let statusFilter: PurchaseStatusFilter
    }

    private struct SearchCursorRecord {
        let offset: Int
        let text: String
        let kind: PurchaseSearchKind
        let status: PurchaseSearchStatus
        let tags: Set<String>
    }

    private struct TagsCursorRecord {
        let offset: Int
        let search: String
    }

    /// Creates a repository whose pages contain at most `pageSize` purchases.
    public init(
        rows: [Purchase] = [],
        hits: [PurchaseSearchHit] = [],
        searchDelay: Duration = .zero,
        pageSize: Int = 5,
        summary: PurchasesMonthSummary = .empty,
        details: [PurchaseDetail] = [],
        receipts: [String: ReceiptImage] = [:],
        tagsInUse: [PurchaseTagCount] = []
    ) {
        self.rows = rows
        self.hits = hits
        self.searchDelay = searchDelay
        self.pageSize = max(1, pageSize)
        self.summary = summary
        self.details = Dictionary(uniqueKeysWithValues: details.map { ($0.id, $0) })
        self.receipts = receipts
        self.tagsInUse = tagsInUse
    }

    public func search(
        text: String, kind: PurchaseSearchKind, status: PurchaseSearchStatus, tags: Set<String>,
        after cursor: String?, limit: Int
    ) async throws -> PurchaseSearchPage {
        let query = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else {
            return PurchaseSearchPage(hits: [], nextCursor: nil, totalCount: 0)
        }
        searchCalls.append(
            SearchCall(
                text: text, kind: kind, status: status, tags: tags, cursor: cursor, limit: limit))
        try beginCall()
        try await Task.sleep(for: searchDelay)
        let matchingHits = hits.filter { hit in
            searchHit(hit, matches: kind) && searchHit(hit, matches: status)
                && searchHit(hit, matches: query)
                && searchHit(hit, matches: tags)
        }
        let start = try offset(
            for: cursor, text: query, kind: kind, status: status, tags: tags,
            count: matchingHits.count)
        let end = min(start + effectiveLimit(limit), matchingHits.count)
        let nextCursor =
            end < matchingHits.count
            ? mintSearchCursor(offset: end, text: query, kind: kind, status: status, tags: tags)
            : nil
        return PurchaseSearchPage(
            hits: Array(matchingHits[start..<end]), nextCursor: nextCursor,
            totalCount: cursor == nil ? matchingHits.count : nil)
    }

    public func purchaseTags(
        search: String, after cursor: String?, limit: Int
    ) async throws -> PurchaseTagPage {
        tagsCalls.append(TagsCall(search: search, cursor: cursor, limit: limit))
        try beginCall()
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        let matchingTags =
            query.isEmpty
            ? tagsInUse
            : tagsInUse.filter { $0.tag.localizedCaseInsensitiveContains(query) }
        let start = try offset(for: cursor, search: query, count: matchingTags.count)
        let end = min(start + effectiveLimit(limit), matchingTags.count)
        let nextCursor =
            end < matchingTags.count
            ? mintTagsCursor(offset: end, search: query)
            : nil
        return PurchaseTagPage(
            tags: Array(matchingTags[start..<end]), nextCursor: nextCursor,
            totalCount: cursor == nil ? matchingTags.count : nil)
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

        let nextCursor = mintCursor(prefix: "purchase-cursor")
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

    private func beginCall() throws {
        callCount += 1
        if let failure = failures[callCount] { throw failure }
    }

    private func effectiveLimit(_ limit: Int) -> Int {
        min(max(1, limit), pageSize)
    }

    private func mintCursor(prefix: String) -> String {
        nextCursorID += 1
        return "\(prefix)-\(nextCursorID)"
    }

    private func mintSearchCursor(
        offset: Int, text: String, kind: PurchaseSearchKind, status: PurchaseSearchStatus,
        tags: Set<String>
    ) -> String {
        let cursor = mintCursor(prefix: "purchase-search-cursor")
        mintedSearchCursors[cursor] = SearchCursorRecord(
            offset: offset, text: text, kind: kind, status: status, tags: tags)
        return cursor
    }

    private func mintTagsCursor(offset: Int, search: String) -> String {
        let cursor = mintCursor(prefix: "purchase-tags-cursor")
        mintedTagCursors[cursor] = TagsCursorRecord(offset: offset, search: search)
        return cursor
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

    private func offset(
        for cursor: String?, text: String, kind: PurchaseSearchKind,
        status: PurchaseSearchStatus, tags: Set<String>, count: Int
    ) throws -> Int {
        guard let cursor else { return 0 }
        guard let minted = mintedSearchCursors[cursor], minted.text == text,
            minted.kind == kind, minted.status == status, minted.tags == tags,
            minted.offset <= count
        else {
            throw RepositoryError.contractMismatch
        }
        return minted.offset
    }

    private func offset(for cursor: String?, search: String, count: Int) throws -> Int {
        guard let cursor else { return 0 }
        guard let minted = mintedTagCursors[cursor], minted.search == search,
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

private func searchHit(_ hit: PurchaseSearchHit, matches kind: PurchaseSearchKind) -> Bool {
    switch (kind, hit) {
    case (.all, _), (.purchases, .purchase), (.lines, .line): true
    default: false
    }
}

private func searchHit(_ hit: PurchaseSearchHit, matches text: String) -> Bool {
    searchableValues(for: hit).contains { $0.localizedCaseInsensitiveContains(text) }
}

private func searchHit(_ hit: PurchaseSearchHit, matches tags: Set<String>) -> Bool {
    guard !tags.isEmpty else { return true }
    guard case .line(_, _, _, _, _, let tagMatch) = hit, let tagMatch else { return false }
    return tags.contains(tagMatch)
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
