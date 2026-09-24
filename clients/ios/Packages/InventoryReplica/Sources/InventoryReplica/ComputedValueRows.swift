import AppCore
import GRDB

/// Each item's computed values, in two layers like the item rows themselves.
/// `item_computed_value` holds the server's evaluations as the feed delivered
/// them. `item_computed_value_local` holds this phone's own evaluations
/// (``LocalComputedValues``), written only where the server's no longer
/// matches what the phone shows. A read takes the local one when there is one.
internal enum ComputedValueRows {
    static let tableName = "item_computed_value"
    static let localTableName = "item_computed_value_local"

    static func register(in migrator: inout DatabaseMigrator) {
        migrator.registerMigration("v8_computed_values") { db in
            try db.execute(sql: createSQL(tableName))
        }
        migrator.registerMigration("v9_local_computed_values") { db in
            try db.execute(sql: createSQL(localTableName))
        }
    }

    private static func createSQL(_ table: String) -> String {
        """
        CREATE TABLE \(table) (
            item_id TEXT NOT NULL,
            field_id TEXT NOT NULL,
            value_json TEXT NOT NULL CHECK (json_valid(value_json)),
            PRIMARY KEY (item_id, field_id)
        )
        """
    }

    static func replace(itemId: String, values: [InventoryComputedValue], in db: Database) throws {
        try db.execute(sql: "DELETE FROM \(tableName) WHERE item_id = ?", arguments: [itemId])
        for value in values {
            try db.execute(
                sql: "INSERT INTO \(tableName) (item_id, field_id, value_json) VALUES (?, ?, ?)",
                arguments: [itemId, value.fieldId, try StoredJSON.encode(value)])
        }
    }

    /// Every computed value the item shows: this phone's evaluation where it
    /// has one, the server's otherwise.
    static func read(itemId: String, in db: Database) throws -> [InventoryComputedValue] {
        let local = try read(itemId: itemId, from: localTableName, in: db)
        let localFields = Set(local.map(\.fieldId))
        let server = try read(itemId: itemId, from: tableName, in: db).filter {
            !localFields.contains($0.fieldId)
        }
        return (server + local).sorted { $0.fieldId < $1.fieldId }
    }

    /// The server's evaluations alone.
    static func readServer(itemId: String, in db: Database) throws -> [InventoryComputedValue] {
        try read(itemId: itemId, from: tableName, in: db)
    }

    static func writeLocal(itemId: String, _ value: InventoryComputedValue, in db: Database) throws
    {
        try db.execute(
            sql: """
                INSERT INTO \(localTableName) (item_id, field_id, value_json) VALUES (?, ?, ?)
                ON CONFLICT(item_id, field_id) DO UPDATE SET value_json = excluded.value_json
                """,
            arguments: [itemId, value.fieldId, try StoredJSON.encode(value)])
    }

    static func deleteLocal(itemId: String, fieldIds: Set<String>? = nil, in db: Database) throws {
        guard let fieldIds else {
            try db.execute(
                sql: "DELETE FROM \(localTableName) WHERE item_id = ?", arguments: [itemId])
            return
        }
        for fieldId in fieldIds {
            try db.execute(
                sql: "DELETE FROM \(localTableName) WHERE item_id = ? AND field_id = ?",
                arguments: [itemId, fieldId])
        }
    }

    /// Items other than `itemId` whose evaluation, in either layer, read one
    /// of its fields or reached it through a reference.
    static func dependents(of itemId: String, in db: Database) throws -> Set<String> {
        var found: Set<String> = []
        for table in [tableName, localTableName] {
            let ids = try String.fetchAll(
                db,
                sql: """
                    SELECT DISTINCT item_id FROM \(table)
                    WHERE item_id <> ?1 AND (
                        EXISTS (SELECT 1 FROM json_each(value_json, '$.dependencies') AS d
                                WHERE json_extract(d.value, '$.itemId') = ?1)
                        OR EXISTS (SELECT 1 FROM json_each(value_json, '$.traversedItemIds') AS t
                                   WHERE t.value = ?1))
                    """,
                arguments: [itemId])
            found.formUnion(ids)
        }
        return found
    }

    private static func read(itemId: String, from table: String, in db: Database) throws
        -> [InventoryComputedValue]
    {
        try String.fetchAll(
            db, sql: "SELECT value_json FROM \(table) WHERE item_id = ? ORDER BY field_id",
            arguments: [itemId]
        ).map { try StoredJSON.decode(InventoryComputedValue.self, from: $0) }
    }
}
