import AppCore
import GRDB

internal enum ReplicaEventPageReader {
    static func read(
        _ query: InventoryEventPageQuery, in db: Database
    ) throws -> InventoryPage<InventoryEvent> {
        var predicates = scopePredicates(query.scope)
        var arguments = scopeArguments(query.scope)
        appendFilter(query.filter, to: &predicates)
        guard appendCursor(query.page.cursor, to: &predicates, arguments: &arguments) else {
            return InventoryPage(rows: [], nextCursor: nil)
        }
        arguments.append(query.page.limit + 1)
        let whereClause =
            predicates.isEmpty
            ? ""
            : "WHERE \(predicates.joined(separator: " AND "))"
        let rows = try Row.fetchAll(
            db,
            sql: "SELECT * FROM event \(whereClause) ORDER BY seq DESC LIMIT ?",
            arguments: StatementArguments(arguments)
        ).map(EventRow.decode)
        let hasMore = rows.count > query.page.limit
        let pageRows = Array(rows.prefix(query.page.limit))
        let nextCursor =
            hasMore
            ? pageRows.last.map { InventoryPageCursor.eventSequence($0.seq) }
            : nil
        return InventoryPage(rows: pageRows, nextCursor: nextCursor)
    }

    private static func scopePredicates(_ scope: InventoryEventPageScope) -> [String] {
        return switch scope {
        case .all: []
        case .item: ["entity_kind = 'item'", "entity_id = ?"]
        case .location: ["entity_kind = 'location'", "entity_id = ?"]
        }
    }

    private static func scopeArguments(_ scope: InventoryEventPageScope) -> InventorySQLArguments {
        return switch scope {
        case .all: []
        case .item(let id), .location(let id): [id]
        }
    }

    private static func appendFilter(
        _ filter: InventoryEventPageFilter, to predicates: inout [String]
    ) {
        switch filter {
        case .any: break
        case .moves: predicates.append("kind = 'moved'")
        case .lifecycle: predicates.append("kind IN ('lifecycle_changed', 'deleted', 'restored')")
        case .lifecycleChanges: predicates.append("kind = 'lifecycle_changed'")
        case .edits:
            predicates.append("kind NOT IN ('moved', 'lifecycle_changed', 'deleted', 'restored')")
        }
    }

    private static func appendCursor(
        _ cursor: InventoryPageCursor?, to predicates: inout [String],
        arguments: inout InventorySQLArguments
    ) -> Bool {
        switch cursor {
        case nil: return true
        case .eventSequence(let sequence):
            predicates.append("seq < ?")
            arguments.append(sequence)
            return true
        default: return false
        }
    }
}
