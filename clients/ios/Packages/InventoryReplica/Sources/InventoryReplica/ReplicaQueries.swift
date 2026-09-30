import AppCore
import Foundation
import GRDB

/// The reads behind every `InventoryQuery`, over the optimistic layer. A
/// tombstoned row is absent from all of them, including a lookup by id: a
/// scanned label for a deleted item is "target missing", the same as one
/// this replica has never heard of. Inactive items are left out of lists
/// (ADR-002 D3), except the containers browser's, and are still found by id
/// and by an inclusive search.
internal enum ReplicaQueries {
    static func item(id: String, in db: Database) throws -> InventoryItem? {
        try Row.fetchOne(
            db, sql: "SELECT * FROM item WHERE id = ? AND deleted_at IS NULL", arguments: [id]
        )
        .map { try ItemRow.decode($0, in: db) }
    }

    /// The pillar's own unique index is `code COLLATE NOCASE`; the column
    /// itself carries no collation, so the comparison names one explicitly
    /// rather than relying on it being the connection's default. Tombstoned
    /// alongside a plain id lookup, per this file's own doc comment: a code
    /// stays reserved once issued, so a deleted holder's label reads as
    /// "target missing", not as though the code had never been used.
    static func item(withCode code: String, in db: Database) throws -> InventoryItem? {
        try Row.fetchOne(
            db,
            sql: "SELECT * FROM item WHERE code = ?1 COLLATE NOCASE AND deleted_at IS NULL",
            arguments: [code]
        )
        .map { try ItemRow.decode($0, in: db) }
    }

    /// The optimistic row, tombstone or not, for the rebase to re-index.
    static func storedItem(id: String, in db: Database) throws -> InventoryItem? {
        try Row.fetchOne(db, sql: "SELECT * FROM item WHERE id = ?", arguments: [id])
            .map { try ItemRow.decode($0, in: db) }
    }

    static func location(id: String, in db: Database) throws -> InventoryLocation? {
        try Row.fetchOne(
            db, sql: "SELECT * FROM location WHERE id = ? AND deleted_at IS NULL", arguments: [id]
        ).map(LocationRow.decode)
    }

    static func locationTree(in db: Database) throws -> [InventoryLocation] {
        try Row.fetchAll(
            db,
            sql: """
                SELECT * FROM location WHERE deleted_at IS NULL
                ORDER BY sort_order, name COLLATE NOCASE, id
                """
        ).map(LocationRow.decode)
    }

    static func inHand(in db: Database) throws -> [InventoryItem] {
        try activeItems(
            where: "placement_kind = 'hand'", orderBy: "name COLLATE NOCASE, id", in: db)
    }

    static func openContainers(in db: Database) throws -> [InventoryItem] {
        try activeItems(
            where: "is_container = 1 AND access = 'open'", orderBy: "name COLLATE NOCASE, id",
            in: db)
    }

    /// Every live container, open or closed, active or not: the containers
    /// browser narrows by state itself.
    static func containers(in db: Database) throws -> [InventoryItem] {
        try Row.fetchAll(
            db,
            sql: """
                SELECT * FROM item WHERE deleted_at IS NULL AND is_container = 1
                ORDER BY name COLLATE NOCASE, id
                """
        ).map { try ItemRow.decode($0, in: db) }
    }

    /// Every live item, the Items browser's catalogue; inactive ones only
    /// when asked for.
    static func items(includeInactive: Bool, in db: Database) throws -> [InventoryItem] {
        let lifecycle = includeInactive ? "" : " AND lifecycle = 'active'"
        return try Row.fetchAll(
            db,
            sql: """
                SELECT * FROM item WHERE deleted_at IS NULL\(lifecycle)
                ORDER BY name COLLATE NOCASE, id
                """
        ).map { try ItemRow.decode($0, in: db) }
    }

    static func itemPage(
        _ query: InventoryItemPageQuery, isStale: Bool, in db: Database
    ) throws -> InventoryPage<InventoryItem> {
        if query.order == .searchRelevance && query.text == nil {
            return InventoryPage(rows: [], nextCursor: nil)
        }
        var predicates = ["item.deleted_at IS NULL"]
        var whereArguments: [(any DatabaseValueConvertible)?] = []
        let filter = query.filter

        if !filter.includeInactive { predicates.append("item.lifecycle = 'active'") }
        if filter.excludeContainers { predicates.append("item.is_container = 0") }
        if filter.excludeContained { predicates.append("item.placement_kind <> 'container'") }
        switch filter.placement {
        case .any: break
        case .hand: predicates.append("item.placement_kind = 'hand'")
        case .location: predicates.append("item.placement_kind = 'location'")
        case .container: predicates.append("item.placement_kind = 'container'")
        }
        switch filter.access {
        case .any: break
        case .open: predicates.append("item.access = 'open'")
        case .closed: predicates.append("item.access = 'closed'")
        }
        if let typeKey = filter.typeKey {
            predicates.append(
                """
                (item.type_key = ? OR item.type_id IN (
                    WITH RECURSIVE matching_types(id, parent_id) AS (
                        SELECT id, parent_id FROM catalogue_type
                        WHERE revision = (SELECT catalogue_revision FROM sync_meta WHERE id = 1)
                          AND key = ?
                        UNION
                        SELECT child.id, child.parent_id FROM catalogue_type AS child
                        JOIN matching_types AS parent ON child.parent_id = parent.id
                        WHERE child.revision = (
                            SELECT catalogue_revision FROM sync_meta WHERE id = 1
                        )
                    )
                    SELECT id FROM matching_types
                ))
                """)
            whereArguments += [typeKey, typeKey]
        }
        if filter.quantityGreaterThanOne { predicates.append("item.quantity > 1") }
        switch filter.missing {
        case .none: break
        case .type:
            predicates.append(
                """
                item.type_key IS NULL AND (
                    item.type_id IS NULL OR NOT EXISTS (
                        SELECT 1 FROM catalogue_type
                        WHERE revision = (SELECT catalogue_revision FROM sync_meta WHERE id = 1)
                          AND id = item.type_id
                    )
                )
                """)
        case .code: predicates.append("item.code IS NULL")
        case .photo: predicates.append("json_array_length(item.photos) = 0")
        }
        switch filter.sync {
        case .any: break
        case .waiting:
            predicates.append(
                """
                EXISTS (
                    SELECT 1 FROM mutation_log
                    WHERE entity_kind = 'item' AND entity_id = item.id
                      AND state IN ('queued', 'sending', 'deferred')
                )
                """)
        case .needsAttention:
            predicates.append(
                """
                EXISTS (
                    SELECT 1 FROM repair
                    WHERE entity_kind = 'item' AND entity_id = item.id AND resolved_at IS NULL
                )
                """)
        case .stale:
            guard isStale else { return InventoryPage(rows: [], nextCursor: nil) }
            predicates.append(
                """
                NOT EXISTS (
                    SELECT 1 FROM mutation_log
                    WHERE entity_kind = 'item' AND entity_id = item.id
                      AND state IN ('queued', 'sending', 'deferred')
                ) AND NOT EXISTS (
                    SELECT 1 FROM repair
                    WHERE entity_kind = 'item' AND entity_id = item.id AND resolved_at IS NULL
                )
                """)
        }
        if !filter.excludingIDs.isEmpty {
            let ids = filter.excludingIDs.sorted()
            predicates.append("item.id NOT IN (\(placeholders(ids.count)))")
            whereArguments += ids
        }
        if let placement = filter.excludingPlacement {
            switch placement {
            case .hand:
                predicates.append("item.placement_kind <> 'hand'")
            case .location(let id):
                predicates.append("NOT (item.placement_kind = 'location' AND item.location_id = ?)")
                whereArguments.append(id)
            case .container(let id):
                predicates.append(
                    "NOT (item.placement_kind = 'container' AND item.containing_item_id = ?)")
                whereArguments.append(id)
            }
        }
        if let text = query.text {
            predicates.append(
                "item.rowid IN (SELECT rowid FROM item_fts WHERE item_fts MATCH ?)")
            whereArguments.append(contentsOf: ReplicaSearchIndex.matchValues(for: text))
        }

        let orderExpression: String
        let orderBy: String
        var cursorArguments: [(any DatabaseValueConvertible)?] = []
        let cursorPredicate: String?
        switch (query.order, query.page.cursor) {
        case (.name, nil):
            orderExpression = ""
            orderBy = "name COLLATE NOCASE, id"
            cursorPredicate = nil
        case (.name, .itemName(let name, let id)):
            orderExpression = ""
            orderBy = "name COLLATE NOCASE, id"
            cursorPredicate =
                "(name COLLATE NOCASE > ? COLLATE NOCASE OR "
                + "(name COLLATE NOCASE = ? COLLATE NOCASE AND id > ?))"
            cursorArguments += [name, name, id]
        case (.createdAtNewest, nil):
            orderExpression = ""
            orderBy = "created_at DESC, id"
            cursorPredicate = nil
        case (.createdAtNewest, .itemCreatedAt(let date, let id)):
            orderExpression = ""
            orderBy = "created_at DESC, id"
            cursorPredicate = "(created_at < ? OR (created_at = ? AND id > ?))"
            let timestamp = date.timeIntervalSinceReferenceDate
            cursorArguments += [timestamp, timestamp, id]
        case (.updatedAtNewest, nil):
            orderExpression = ""
            orderBy = "updated_at DESC, id"
            cursorPredicate = nil
        case (.updatedAtNewest, .itemUpdatedAt(let date, let id)):
            orderExpression = ""
            orderBy = "updated_at DESC, id"
            cursorPredicate = "(updated_at < ? OR (updated_at = ? AND id > ?))"
            let timestamp = date.timeIntervalSinceReferenceDate
            cursorArguments += [timestamp, timestamp, id]
        case (.searchRelevance, nil),
            (.searchRelevance, .itemSearchRank(_, _, _)),
            (.searchRelevance, .searchHitRank(_, _, _, _)):
            orderExpression = searchRankExpression
            orderBy = "search_rank, name COLLATE NOCASE, id"
            if case .itemSearchRank(let rank, let name, let id) = query.page.cursor {
                cursorPredicate =
                    "(search_rank > ? OR (search_rank = ? AND "
                    + "(name COLLATE NOCASE > ? COLLATE NOCASE OR "
                    + "(name COLLATE NOCASE = ? COLLATE NOCASE AND id > ?))))"
                cursorArguments += [rank, rank, name, name, id]
            } else if case .searchHitRank(let rank, let isLocation, let name, let id) = query.page.cursor {
                if isLocation {
                    cursorPredicate = "search_rank > ?"
                    cursorArguments.append(rank)
                } else {
                    cursorPredicate =
                        "(search_rank > ? OR (search_rank = ? AND "
                        + "(name COLLATE NOCASE > ? COLLATE NOCASE OR "
                        + "(name COLLATE NOCASE = ? COLLATE NOCASE AND id > ?))))"
                    cursorArguments += [rank, rank, name, name, id]
                }
            } else {
                cursorPredicate = nil
            }
        default:
            return InventoryPage(rows: [], nextCursor: nil)
        }

        var selectedArguments: [(any DatabaseValueConvertible)?] = []
        if !orderExpression.isEmpty {
            let text = escapeLike(query.text ?? "")
            selectedArguments += ["\(text)%", "%\(text)%"]
        }
        let pagePredicate = cursorPredicate.map { "WHERE \($0)" } ?? ""
        let sql = """
            WITH candidates AS (
                SELECT item.* \(orderExpression.isEmpty ? "" : ", \(orderExpression) AS search_rank")
                FROM item
                WHERE \(predicates.joined(separator: " AND "))
            )
            SELECT * FROM candidates
            \(pagePredicate)
            ORDER BY \(orderBy)
            LIMIT ?
            """
        let rows = try Row.fetchAll(
            db, sql: sql,
            arguments: StatementArguments(
                selectedArguments + whereArguments + cursorArguments + [query.page.limit + 1]))
            .map { try ItemRow.decode($0, in: db) }
        let hasMore = rows.count > query.page.limit
        let pageRows = Array(rows.prefix(query.page.limit))
        let nextCursor = hasMore ? pageRows.last.map { itemCursor($0, order: query.order, text: query.text) } : nil
        return InventoryPage(rows: pageRows, nextCursor: nextCursor)
    }

    static func searchPage(
        _ query: InventorySearchPageQuery, isStale: Bool, in db: Database
    ) throws -> InventoryPage<InventorySearchPageRow> {
        guard !query.text.isEmpty else { return InventoryPage(rows: [], nextCursor: nil) }
        let itemPage = try itemPage(
            InventoryItemPageQuery(
                text: query.text, filter: query.filter, order: .searchRelevance,
                page: query.page),
            isStale: isStale,
            in: db)
        let locationPage = query.includeLocations
            ? try locationPage(query.text, request: query.page, in: db)
            : InventoryPage<InventoryLocation>(rows: [], nextCursor: nil)
        let rows = (itemPage.rows.map(InventorySearchPageRow.item)
            + locationPage.rows.map(InventorySearchPageRow.location))
            .sorted {
                let lhsRank = InventorySearchRanking.rank($0.name, for: query.text)
                let rhsRank = InventorySearchRanking.rank($1.name, for: query.text)
                if lhsRank != rhsRank { return lhsRank < rhsRank }
                if $0.isLocation != $1.isLocation { return !$0.isLocation }
                switch $0.name.localizedCaseInsensitiveCompare($1.name) {
                case .orderedAscending: return true
                case .orderedDescending: return false
                case .orderedSame: return $0.id < $1.id
                }
            }
        let hasMore = rows.count > query.page.limit
            || itemPage.nextCursor != nil || locationPage.nextCursor != nil
        let pageRows = Array(rows.prefix(query.page.limit))
        let nextCursor = hasMore ? pageRows.last.map {
            InventoryPageCursor.searchHitRank(
                rank: InventorySearchRanking.rank($0.name, for: query.text),
                isLocation: $0.isLocation, name: $0.name, id: $0.id)
        } : nil
        return InventoryPage(rows: pageRows, nextCursor: nextCursor)
    }

    private static func locationPage(
        _ text: String, request: InventoryPageRequest, in db: Database
    ) throws -> InventoryPage<InventoryLocation> {
        var cursorArguments: [(any DatabaseValueConvertible)?] = []
        let cursorPredicate: String?
        switch request.cursor {
        case nil:
            cursorPredicate = nil
        case .searchHitRank(let rank, false, _, _):
            cursorPredicate = "search_rank >= ?"
            cursorArguments.append(rank)
        case .searchHitRank(let rank, true, let name, let id):
            cursorPredicate =
                "(search_rank > ? OR (search_rank = ? AND "
                + "(name COLLATE NOCASE > ? COLLATE NOCASE OR "
                + "(name COLLATE NOCASE = ? COLLATE NOCASE AND id > ?))))"
            cursorArguments += [rank, rank, name, name, id]
        default:
            return InventoryPage(rows: [], nextCursor: nil)
        }
        let escaped = escapeLike(text)
        let selectedArguments: [(any DatabaseValueConvertible)?] = ["\(escaped)%", "%\(escaped)%"]
        let pagePredicate = cursorPredicate.map { "WHERE \($0)" } ?? ""
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
                SELECT * FROM candidates \(pagePredicate)
                ORDER BY search_rank, name COLLATE NOCASE, id
                LIMIT ?
                """,
            arguments: StatementArguments(
                selectedArguments + ["%\(escaped)%"] + cursorArguments + [request.limit + 1]))
            .map(LocationRow.decode)
        let hasMore = rows.count > request.limit
        let pageRows = Array(rows.prefix(request.limit))
        let nextCursor = hasMore ? pageRows.last.map {
            InventoryPageCursor.searchHitRank(
                rank: InventorySearchRanking.rank($0.name, for: text), isLocation: true,
                name: $0.name, id: $0.id)
        } : nil
        return InventoryPage(rows: pageRows, nextCursor: nextCursor)
    }

    static func eventPage(
        _ query: InventoryEventPageQuery, in db: Database
    ) throws -> InventoryPage<InventoryEvent> {
        var predicates: [String]
        var arguments: [(any DatabaseValueConvertible)?] = []
        switch query.scope {
        case .all: predicates = []
        case .item(let id):
            predicates = ["entity_kind = 'item'", "entity_id = ?"]
            arguments.append(id)
        case .location(let id):
            predicates = ["entity_kind = 'location'", "entity_id = ?"]
            arguments.append(id)
        }
        switch query.filter {
        case .any: break
        case .moves: predicates.append("kind = 'moved'")
        case .lifecycle: predicates.append("kind IN ('lifecycle_changed', 'deleted', 'restored')")
        case .lifecycleChanges: predicates.append("kind = 'lifecycle_changed'")
        case .edits:
            predicates.append("kind NOT IN ('moved', 'lifecycle_changed', 'deleted', 'restored')")
        }
        switch query.page.cursor {
        case nil: break
        case .eventSequence(let sequence):
            predicates.append("seq < ?")
            arguments.append(sequence)
        default: return InventoryPage(rows: [], nextCursor: nil)
        }
        arguments.append(query.page.limit + 1)
        let whereClause = predicates.isEmpty ? "" : "WHERE \(predicates.joined(separator: " AND "))"
        let rows = try Row.fetchAll(
            db,
            sql: "SELECT * FROM event \(whereClause) ORDER BY seq DESC LIMIT ?",
            arguments: StatementArguments(arguments))
            .map(EventRow.decode)
        let hasMore = rows.count > query.page.limit
        let pageRows = Array(rows.prefix(query.page.limit))
        let nextCursor: InventoryPageCursor? =
            hasMore ? pageRows.last.map { InventoryPageCursor.eventSequence($0.seq) } : nil
        return InventoryPage(rows: pageRows, nextCursor: nextCursor)
    }

    static func itemPageSummary(createdSince: Date, in db: Database) throws -> InventoryItemPageSummary {
        let row = try Row.fetchOne(
            db,
            sql: """
                SELECT
                    count(*) AS active_items,
                    coalesce(sum(placement_kind = 'hand'), 0) AS in_hand,
                    coalesce(sum(type_key IS NULL AND (
                        type_id IS NULL OR NOT EXISTS (
                            SELECT 1 FROM catalogue_type
                            WHERE revision = (SELECT catalogue_revision FROM sync_meta WHERE id = 1)
                              AND id = item.type_id
                        )
                    )), 0) AS untyped,
                    coalesce(sum(created_at >= ?), 0) AS created_recently
                FROM item WHERE deleted_at IS NULL AND lifecycle = 'active' AND is_container = 0
                """,
            arguments: [createdSince.timeIntervalSinceReferenceDate])
        return InventoryItemPageSummary(
            activeItems: try row?.decode(forColumn: "active_items") ?? 0,
            inHand: try row?.decode(forColumn: "in_hand") ?? 0,
            untyped: try row?.decode(forColumn: "untyped") ?? 0,
            createdRecently: try row?.decode(forColumn: "created_recently") ?? 0)
    }

    private static let searchRankExpression = """
        CASE
            WHEN item.name COLLATE NOCASE LIKE ? ESCAPE '\\' THEN 0
            WHEN item.name COLLATE NOCASE LIKE ? ESCAPE '\\' THEN 1
            ELSE 2
        END
        """

    private static func itemCursor(
        _ item: InventoryItem, order: InventoryItemPageQuery.Order, text: String?
    ) -> InventoryPageCursor {
        switch order {
        case .name: .itemName(name: item.name, id: item.id)
        case .createdAtNewest: .itemCreatedAt(date: item.createdAt, id: item.id)
        case .updatedAtNewest: .itemUpdatedAt(date: item.updatedAt, id: item.id)
        case .searchRelevance:
            .itemSearchRank(
                rank: InventorySearchRanking.rank(item.name, for: text ?? ""), name: item.name,
                id: item.id)
        }
    }

    private static func placeholders(_ count: Int) -> String {
        Array(repeating: "?", count: count).joined(separator: ", ")
    }

    private static func escapeLike(_ text: String) -> String {
        ["\\", "%", "_"].reduce(text) { $0.replacingOccurrences(of: $1, with: "\\" + $1) }
    }

    /// Only what sits directly inside: an item in a tin in this crate is the
    /// tin's, not the crate's.
    static func contents(ofContainer containerId: String, in db: Database) throws -> [InventoryItem]
    {
        try activeItems(
            where: "containing_item_id = ?", [containerId], orderBy: "name COLLATE NOCASE, id",
            in: db)
    }

    static func recents(limit: Int, in db: Database) throws -> [InventoryItem] {
        guard limit > 0 else { return [] }
        return try activeItems(where: "1", orderBy: "updated_at DESC, id", limit: limit, in: db)
    }

    /// Newest first, which is the order the History screen reads in.
    static func history(of kind: InventoryEntityKind, id: String, in db: Database) throws
        -> [InventoryEvent]
    {
        try Row.fetchAll(
            db,
            sql: "SELECT * FROM event WHERE entity_kind = ? AND entity_id = ? ORDER BY seq DESC",
            arguments: [kind.storageValue, id]
        ).map(EventRow.decode)
    }

    /// Across every item and location, newest first by server `seq`.
    static func recentEvents(limit: Int, in db: Database) throws -> [InventoryEvent] {
        guard limit > 0 else { return [] }
        return try Row.fetchAll(
            db, sql: "SELECT * FROM event ORDER BY seq DESC LIMIT ?", arguments: [limit]
        ).map(EventRow.decode)
    }

    /// `items` counts every active item, containers included; `containers`
    /// counts only those.
    static func counts(in db: Database) throws -> InventoryCounts {
        let active = "FROM item WHERE deleted_at IS NULL AND lifecycle = 'active'"
        let row = try Row.fetchOne(
            db,
            sql: """
                SELECT
                    (SELECT count(*) \(active)) AS items,
                    (SELECT count(*) \(active) AND is_container = 1) AS containers,
                    (SELECT count(*) FROM location WHERE deleted_at IS NULL) AS locations
                """)
        return InventoryCounts(
            items: try row?.decode(forColumn: "items") ?? 0,
            containers: try row?.decode(forColumn: "containers") ?? 0,
            locations: try row?.decode(forColumn: "locations") ?? 0)
    }

    /// `limit` defaults to -1, which is SQLite's "no limit".
    private static func activeItems(
        where predicate: String, _ arguments: StatementArguments = [], orderBy order: String,
        limit: Int = -1, in db: Database
    ) throws -> [InventoryItem] {
        try Row.fetchAll(
            db,
            sql: """
                SELECT * FROM item WHERE deleted_at IS NULL AND lifecycle = 'active' AND \(predicate)
                ORDER BY \(order) LIMIT ?
                """,
            arguments: arguments + [limit]
        ).map { try ItemRow.decode($0, in: db) }
    }
}
