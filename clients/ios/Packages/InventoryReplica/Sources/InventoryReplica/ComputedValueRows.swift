import AppCore
import GRDB

/// The server's evaluations of each item's computed fields. Only the server
/// produces them, so there is one layer: a local change never writes here,
/// and the display compares the evaluated item revision with the item as the
/// phone now shows it (``InventoryComputedValue/display(in:revisionOf:)``).
internal enum ComputedValueRows {
    static let tableName = "item_computed_value"

    static func register(in migrator: inout DatabaseMigrator) {
        migrator.registerMigration("v8_computed_values") { db in
            try db.execute(
                sql: """
                    CREATE TABLE \(tableName) (
                        item_id TEXT NOT NULL,
                        field_id TEXT NOT NULL,
                        value_json TEXT NOT NULL CHECK (json_valid(value_json)),
                        PRIMARY KEY (item_id, field_id)
                    )
                    """)
        }
    }

    static func replace(itemId: String, values: [InventoryComputedValue], in db: Database) throws {
        try db.execute(sql: "DELETE FROM \(tableName) WHERE item_id = ?", arguments: [itemId])
        for value in values {
            try db.execute(
                sql: "INSERT INTO \(tableName) (item_id, field_id, value_json) VALUES (?, ?, ?)",
                arguments: [itemId, value.fieldId, try StoredJSON.encode(value)])
        }
    }

    static func read(itemId: String, in db: Database) throws -> [InventoryComputedValue] {
        try String.fetchAll(
            db, sql: "SELECT value_json FROM \(tableName) WHERE item_id = ? ORDER BY field_id",
            arguments: [itemId]
        ).map { try StoredJSON.decode(InventoryComputedValue.self, from: $0) }
    }
}
