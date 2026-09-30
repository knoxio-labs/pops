import AppCore
import Foundation
import GRDB

internal typealias InventorySQLArguments = [(any DatabaseValueConvertible)?]

internal enum ReplicaPageSQL {
    static let itemSearchRankExpression = """
        CASE
            WHEN item.name COLLATE NOCASE LIKE ? ESCAPE '\\' THEN 0
            WHEN item.name COLLATE NOCASE LIKE ? ESCAPE '\\' THEN 1
            ELSE 2
        END
        """

    static func placeholders(_ count: Int) -> String {
        Array(repeating: "?", count: count).joined(separator: ", ")
    }

    static func escapeLike(_ text: String) -> String {
        ["\\", "%", "_"].reduce(text) { $0.replacingOccurrences(of: $1, with: "\\" + $1) }
    }

    static func itemCursor(
        _ item: InventoryItem, order: InventoryItemPageQuery.Order, text: String?
    ) -> InventoryPageCursor {
        return switch order {
        case .name: .itemName(name: item.name, id: item.id)
        case .createdAtNewest: .itemCreatedAt(date: item.createdAt, id: item.id)
        case .updatedAtNewest: .itemUpdatedAt(date: item.updatedAt, id: item.id)
        case .searchRelevance:
            .itemSearchRank(
                rank: InventorySearchRanking.rank(item.name, for: text ?? ""), name: item.name,
                id: item.id)
        }
    }
}
