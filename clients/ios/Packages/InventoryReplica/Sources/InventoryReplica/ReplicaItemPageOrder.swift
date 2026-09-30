import AppCore
import Foundation

internal struct ReplicaItemPageOrder {
    let expression: String
    let orderBy: String
    let cursorPredicate: String?
    let cursorArguments: InventorySQLArguments
    let selectedArguments: InventorySQLArguments

    static func make(
        order: InventoryItemPageQuery.Order, cursor: InventoryPageCursor?, text: String?
    ) -> ReplicaItemPageOrder? {
        return switch order {
        case .name: nameOrder(cursor)
        case .createdAtNewest: dateOrder("created_at", cursor: cursor, createdAt: true)
        case .updatedAtNewest: dateOrder("updated_at", cursor: cursor, createdAt: false)
        case .searchRelevance: searchOrder(cursor, text: text)
        }
    }

    private static func nameOrder(_ cursor: InventoryPageCursor?) -> ReplicaItemPageOrder? {
        switch cursor {
        case nil:
            return ReplicaItemPageOrder(
                expression: "", orderBy: "name COLLATE NOCASE, id", cursorPredicate: nil,
                cursorArguments: [], selectedArguments: [])
        case .itemName(let name, let id):
            return ReplicaItemPageOrder(
                expression: "", orderBy: "name COLLATE NOCASE, id",
                cursorPredicate: "(name COLLATE NOCASE > ? COLLATE NOCASE OR "
                    + "(name COLLATE NOCASE = ? COLLATE NOCASE AND id > ?))",
                cursorArguments: [name, name, id], selectedArguments: [])
        default:
            return nil
        }
    }

    private static func dateOrder(
        _ column: String, cursor: InventoryPageCursor?, createdAt: Bool
    ) -> ReplicaItemPageOrder? {
        switch cursor {
        case nil:
            return ReplicaItemPageOrder(
                expression: "", orderBy: "\(column) DESC, id", cursorPredicate: nil,
                cursorArguments: [], selectedArguments: [])
        case .itemCreatedAt(let date, let id) where createdAt:
            return dateBoundary(column, date: date, id: id)
        case .itemUpdatedAt(let date, let id) where !createdAt:
            return dateBoundary(column, date: date, id: id)
        default:
            return nil
        }
    }

    private static func dateBoundary(
        _ column: String, date: Date, id: String
    ) -> ReplicaItemPageOrder {
        let timestamp = date.timeIntervalSinceReferenceDate
        return ReplicaItemPageOrder(
            expression: "", orderBy: "\(column) DESC, id",
            cursorPredicate: "(\(column) < ? OR (\(column) = ? AND id > ?))",
            cursorArguments: [timestamp, timestamp, id], selectedArguments: [])
    }

    private static func searchOrder(
        _ cursor: InventoryPageCursor?, text: String?
    ) -> ReplicaItemPageOrder? {
        let boundary: (String?, InventorySQLArguments)?
        switch cursor {
        case nil:
            boundary = (nil, [])
        case .itemSearchRank(let rank, let name, let id):
            boundary = (nameBoundary(), [rank, rank, name, name, id])
        case .searchHitRank(let rank, let isLocation, let name, let id):
            boundary =
                isLocation
                ? ("search_rank > ?", [rank])
                : (nameBoundary(), [rank, rank, name, name, id])
        default:
            boundary = nil
        }
        guard let boundary else { return nil }
        let escaped = ReplicaPageSQL.escapeLike(text ?? "")
        return ReplicaItemPageOrder(
            expression: ReplicaPageSQL.itemSearchRankExpression,
            orderBy: "search_rank, name COLLATE NOCASE, id",
            cursorPredicate: boundary.0,
            cursorArguments: boundary.1,
            selectedArguments: ["\(escaped)%", "%\(escaped)%"])
    }

    private static func nameBoundary() -> String {
        "(search_rank > ? OR (search_rank = ? AND "
            + "(name COLLATE NOCASE > ? COLLATE NOCASE OR "
            + "(name COLLATE NOCASE = ? COLLATE NOCASE AND id > ?))))"
    }
}
