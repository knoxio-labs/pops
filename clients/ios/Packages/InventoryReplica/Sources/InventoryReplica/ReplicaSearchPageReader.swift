import AppCore
import GRDB

internal enum ReplicaSearchPageReader {
    static func read(
        _ query: InventorySearchPageQuery, isStale: Bool, in db: Database
    ) throws -> InventoryPage<InventorySearchPageRow> {
        guard !query.text.isEmpty else { return InventoryPage(rows: [], nextCursor: nil) }
        let itemQuery = InventoryItemPageQuery(
            text: query.text, filter: query.filter, order: .searchRelevance, page: query.page)
        let items = try ReplicaItemPageReader.read(itemQuery, isStale: isStale, in: db)
        let locations =
            query.includeLocations
            ? try locationPage(query.text, request: query.page, in: db)
            : InventoryPage<InventoryLocation>(rows: [], nextCursor: nil)
        return page(items: items, locations: locations, query: query)
    }

    private static func page(
        items: InventoryPage<InventoryItem>, locations: InventoryPage<InventoryLocation>,
        query: InventorySearchPageQuery
    ) -> InventoryPage<InventorySearchPageRow> {
        let rows =
            (items.rows.map(InventorySearchPageRow.item)
            + locations.rows.map(InventorySearchPageRow.location))
            .sorted { precedes($0, $1, text: query.text) }
        let hasMore =
            rows.count > query.page.limit
            || items.nextCursor != nil || locations.nextCursor != nil
        let pageRows = Array(rows.prefix(query.page.limit))
        let nextCursor = pageRows.last.flatMap { row in
            hasMore
                ? InventoryPageCursor.searchHitRank(
                    rank: InventorySearchRanking.rank(row.name, for: query.text),
                    isLocation: row.isLocation, name: row.name, id: row.id)
                : nil
        }
        return InventoryPage(rows: pageRows, nextCursor: nextCursor)
    }

    private static func precedes(
        _ lhs: InventorySearchPageRow, _ rhs: InventorySearchPageRow, text: String
    ) -> Bool {
        let leftRank = InventorySearchRanking.rank(lhs.name, for: text)
        let rightRank = InventorySearchRanking.rank(rhs.name, for: text)
        if leftRank != rightRank { return leftRank < rightRank }
        if lhs.isLocation != rhs.isLocation { return !lhs.isLocation }
        return switch lhs.name.localizedCaseInsensitiveCompare(rhs.name) {
        case .orderedAscending: true
        case .orderedDescending: false
        case .orderedSame: lhs.id < rhs.id
        }
    }

    private static func locationPage(
        _ text: String, request: InventoryPageRequest, in db: Database
    ) throws -> InventoryPage<InventoryLocation> {
        guard let boundary = ReplicaLocationPageBoundary(cursor: request.cursor) else {
            return InventoryPage(rows: [], nextCursor: nil)
        }
        let escaped = ReplicaPageSQL.escapeLike(text)
        let arguments: InventorySQLArguments =
            ["\(escaped)%", "%\(escaped)%", "%\(escaped)%"]
            + boundary.arguments + [request.limit + 1]
        let cursorPredicate = boundary.predicate.map { "WHERE \($0)" } ?? ""
        let rows = try Row.fetchAll(
            db,
            sql: """
                WITH candidates AS (
                    SELECT location.*,
                        CASE
                            WHEN name COLLATE NOCASE LIKE ? ESCAPE '\\' THEN 0
                            WHEN name COLLATE NOCASE LIKE ? ESCAPE '\\' THEN 1
                            ELSE 2
                        END AS search_rank
                    FROM location
                    WHERE deleted_at IS NULL AND name LIKE ? ESCAPE '\\'
                )
                SELECT * FROM candidates \(cursorPredicate)
                ORDER BY search_rank, name COLLATE NOCASE, id
                LIMIT ?
                """,
            arguments: StatementArguments(arguments)
        ).map(LocationRow.decode)
        return locationPage(rows, request: request, text: text)
    }

    private static func locationPage(
        _ rows: [InventoryLocation], request: InventoryPageRequest, text: String
    ) -> InventoryPage<InventoryLocation> {
        let hasMore = rows.count > request.limit
        let pageRows = Array(rows.prefix(request.limit))
        let nextCursor =
            hasMore
            ? pageRows.last.map {
                InventoryPageCursor.searchHitRank(
                    rank: InventorySearchRanking.rank($0.name, for: text), isLocation: true,
                    name: $0.name, id: $0.id)
            }
            : nil
        return InventoryPage(rows: pageRows, nextCursor: nextCursor)
    }
}

private struct ReplicaLocationPageBoundary {
    let predicate: String?
    let arguments: InventorySQLArguments

    init?(cursor: InventoryPageCursor?) {
        switch cursor {
        case nil:
            predicate = nil
            arguments = []
        case .searchHitRank(let rank, false, _, _):
            predicate = "search_rank >= ?"
            arguments = [rank]
        case .searchHitRank(let rank, true, let name, let id):
            predicate =
                "(search_rank > ? OR (search_rank = ? AND "
                + "(name COLLATE NOCASE > ? COLLATE NOCASE OR "
                + "(name COLLATE NOCASE = ? COLLATE NOCASE AND id > ?))))"
            arguments = [rank, rank, name, name, id]
        default:
            return nil
        }
    }
}
