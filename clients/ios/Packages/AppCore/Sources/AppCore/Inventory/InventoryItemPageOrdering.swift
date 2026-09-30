import Foundation

internal enum InventoryItemPageOrdering {
    static func searchOrder(
        _ lhs: InventorySearchPageRow, _ rhs: InventorySearchPageRow, text: String
    ) -> Bool {
        let leftRank = searchRank(lhs.name, text)
        let rightRank = searchRank(rhs.name, text)
        if leftRank != rightRank { return leftRank < rightRank }
        if lhs.isLocation != rhs.isLocation { return !lhs.isLocation }
        switch lhs.name.localizedCaseInsensitiveCompare(rhs.name) {
        case .orderedAscending: return true
        case .orderedDescending: return false
        case .orderedSame: return lhs.id < rhs.id
        }
    }

    static func searchPage(
        _ rows: [InventorySearchPageRow], request: InventoryPageRequest, text: String
    ) -> InventoryPage<InventorySearchPageRow> {
        let afterCursor: (InventorySearchPageRow) -> Bool
        switch request.cursor {
        case nil: afterCursor = { _ in true }
        case .searchHitRank(let rank, let isLocation, let name, let id):
            afterCursor = {
                let rowRank = searchRank($0.name, text)
                if rowRank != rank { return rowRank > rank }
                if $0.isLocation != isLocation { return $0.isLocation }
                return nameAfter($0.name, $0.id, name, id)
            }
        default: return InventoryPage(rows: [], nextCursor: nil)
        }
        let slice = Array(rows.filter(afterCursor).prefix(request.limit + 1))
        let hasMore = slice.count > request.limit
        let pageRows = Array(slice.prefix(request.limit))
        let nextCursor =
            hasMore
            ? pageRows.last.map {
                InventoryPageCursor.searchHitRank(
                    rank: searchRank($0.name, text), isLocation: $0.isLocation, name: $0.name,
                    id: $0.id)
            } : nil
        return InventoryPage(rows: pageRows, nextCursor: nextCursor)
    }

    static func ordered(
        _ rows: [InventoryItem], by order: InventoryItemPageQuery.Order, text: String?
    ) -> [InventoryItem] {
        return switch order {
        case .name:
            rows.sorted(by: nameOrder)
        case .createdAtNewest:
            rows.sorted { dateOrder($0.createdAt, $0.id, $1.createdAt, $1.id) }
        case .updatedAtNewest:
            rows.sorted { dateOrder($0.updatedAt, $0.id, $1.updatedAt, $1.id) }
        case .searchRelevance:
            rows.sorted { left, right in
                let leftRank = searchRank(left.name, text ?? "")
                let rightRank = searchRank(right.name, text ?? "")
                if leftRank != rightRank { return leftRank < rightRank }
                return nameOrder(left, right)
            }
        }
    }

    static func page(
        _ rows: [InventoryItem], request: InventoryPageRequest,
        order: InventoryItemPageQuery.Order, text: String?
    ) -> InventoryPage<InventoryItem> {
        let afterCursor: (InventoryItem) -> Bool
        switch request.cursor {
        case nil:
            afterCursor = { _ in true }
        case .itemName(let name, let id) where order == .name:
            afterCursor = { nameAfter($0, name: name, id: id) }
        case .itemCreatedAt(let date, let id) where order == .createdAtNewest:
            afterCursor = { dateAfter($0.createdAt, $0.id, date, id) }
        case .itemUpdatedAt(let date, let id) where order == .updatedAtNewest:
            afterCursor = { dateAfter($0.updatedAt, $0.id, date, id) }
        case .itemSearchRank(let rank, let name, let id) where order == .searchRelevance:
            afterCursor = {
                let itemRank = searchRank($0.name, text ?? "")
                return itemRank == rank ? nameAfter($0, name: name, id: id) : itemRank > rank
            }
        default:
            return InventoryPage(rows: [], nextCursor: nil)
        }
        let remaining = rows.filter(afterCursor)
        let slice = Array(remaining.prefix(request.limit + 1))
        let hasMore = slice.count > request.limit
        let pageRows = Array(slice.prefix(request.limit))
        let nextCursor =
            hasMore ? pageRows.last.map { cursor(for: $0, order: order, text: text) } : nil
        return InventoryPage(rows: pageRows, nextCursor: nextCursor)
    }

    static func page(
        _ rows: [InventoryEvent], request: InventoryPageRequest
    ) -> InventoryPage<InventoryEvent> {
        let afterCursor: (InventoryEvent) -> Bool
        switch request.cursor {
        case nil: afterCursor = { _ in true }
        case .eventSequence(let sequence): afterCursor = { $0.seq < sequence }
        default: return InventoryPage(rows: [], nextCursor: nil)
        }
        let remaining = rows.filter(afterCursor)
        let slice = Array(remaining.prefix(request.limit + 1))
        let hasMore = slice.count > request.limit
        let pageRows = Array(slice.prefix(request.limit))
        let nextCursor: InventoryPageCursor? =
            hasMore ? pageRows.last.map { InventoryPageCursor.eventSequence($0.seq) } : nil
        return InventoryPage(rows: pageRows, nextCursor: nextCursor)
    }

    private static func cursor(
        for item: InventoryItem, order: InventoryItemPageQuery.Order, text: String?
    ) -> InventoryPageCursor {
        return switch order {
        case .name: .itemName(name: item.name, id: item.id)
        case .createdAtNewest: .itemCreatedAt(date: item.createdAt, id: item.id)
        case .updatedAtNewest: .itemUpdatedAt(date: item.updatedAt, id: item.id)
        case .searchRelevance:
            .itemSearchRank(rank: searchRank(item.name, text ?? ""), name: item.name, id: item.id)
        }
    }

    private static func searchRank(_ name: String, _ query: String) -> Int {
        guard !query.isEmpty else { return 2 }
        if name.range(of: query, options: [.caseInsensitive, .anchored]) != nil { return 0 }
        return name.localizedCaseInsensitiveContains(query) ? 1 : 2
    }

    private static func nameOrder(_ lhs: InventoryItem, _ rhs: InventoryItem) -> Bool {
        return switch lhs.name.localizedCaseInsensitiveCompare(rhs.name) {
        case .orderedAscending: true
        case .orderedDescending: false
        case .orderedSame: lhs.id < rhs.id
        }
    }

    private static func dateOrder(
        _ lhsDate: Date, _ lhsID: String, _ rhsDate: Date, _ rhsID: String
    )
        -> Bool
    {
        lhsDate == rhsDate ? lhsID < rhsID : lhsDate > rhsDate
    }

    private static func nameAfter(_ item: InventoryItem, name: String, id: String) -> Bool {
        nameAfter(item.name, item.id, name, id)
    }

    private static func nameAfter(
        _ itemName: String, _ itemID: String, _ name: String, _ id: String
    )
        -> Bool
    {
        return switch itemName.localizedCaseInsensitiveCompare(name) {
        case .orderedDescending: true
        case .orderedAscending: false
        case .orderedSame: itemID > id
        }
    }

    private static func dateAfter(_ itemDate: Date, _ itemID: String, _ date: Date, _ id: String)
        -> Bool
    {
        itemDate == date ? itemID > id : itemDate < date
    }
}
