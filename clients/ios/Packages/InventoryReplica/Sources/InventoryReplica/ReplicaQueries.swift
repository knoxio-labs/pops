import AppCore
import GRDB

/// The reads behind every `InventoryQuery`, over the optimistic layer. A
/// tombstoned row is absent from all of them, including a lookup by id: a
/// scanned label for a deleted item is "target missing", the same as one
/// this replica has never heard of. Inactive items are left out of lists
/// (ADR-002 D3) but still found by id and by an inclusive search.
internal enum ReplicaQueries {
    static func item(id: String, in db: Database) throws -> InventoryItem? {
        try Row.fetchOne(
            db, sql: "SELECT * FROM item WHERE id = ? AND deleted_at IS NULL", arguments: [id]
        )
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
