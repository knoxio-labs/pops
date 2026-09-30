import AppCore
import GRDB

internal enum ReplicaItemPageReader {
    static func read(
        _ query: InventoryItemPageQuery, isStale: Bool, in db: Database
    ) throws -> InventoryPage<InventoryItem> {
        guard query.order != .searchRelevance || query.text != nil,
            let predicate = ReplicaItemPagePredicate(
                filter: query.filter, text: query.text, isStale: isStale),
            let order = ReplicaItemPageOrder.make(
                order: query.order, cursor: query.page.cursor, text: query.text)
        else { return InventoryPage(rows: [], nextCursor: nil) }

        let cursorPredicate = order.cursorPredicate.map { "WHERE \($0)" } ?? ""
        let projection = order.expression.isEmpty ? "" : ", \(order.expression) AS search_rank"
        let sql = """
            WITH candidates AS (
                SELECT item.*\(projection)
                FROM item
                WHERE \(predicate.sql)
            )
            SELECT * FROM candidates \(cursorPredicate)
            ORDER BY \(order.orderBy)
            LIMIT ?
            """
        let arguments =
            order.selectedArguments + predicate.arguments
            + order.cursorArguments + [query.page.limit + 1]
        let rows = try Row.fetchAll(db, sql: sql, arguments: StatementArguments(arguments))
            .map { try ItemRow.decode($0, in: db) }
        return page(rows, query: query)
    }

    private static func page(
        _ rows: [InventoryItem], query: InventoryItemPageQuery
    ) -> InventoryPage<InventoryItem> {
        let hasMore = rows.count > query.page.limit
        let pageRows = Array(rows.prefix(query.page.limit))
        let nextCursor =
            hasMore
            ? pageRows.last.map {
                ReplicaPageSQL.itemCursor($0, order: query.order, text: query.text)
            }
            : nil
        return InventoryPage(rows: pageRows, nextCursor: nextCursor)
    }
}
