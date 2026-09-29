import AppCore
import Foundation
import GRDB
import Testing

@testable import InventoryReplica

@Suite("Resolved legacy projection issues")
internal struct LegacyProjectionIssueMigrationTests {
    @Test("resolved legacy projection issues are removed without touching field values")
    func resolvedLegacyProjectionIssuesAreRemoved() throws {
        let queue = try DatabaseQueue()
        let migrator = ReplicaSchema.migrator()
        try migrator.migrate(queue, upTo: "v16_sync_item_issues")
        try queue.write { db in
            try Self.insertCatalogueField(in: db)
            try db.execute(
                sql: """
                    INSERT INTO item_field_value_base
                        (item_id, field_id, source, ordinal, catalogue_revision, value_json)
                    VALUES ('item-1', 'field-1', 'stored', 0, 1, '"value"')
                    """)
            try Self.insertIssue(
                id: "item-1:1:field_definition_missing:field-1", itemId: "item-1",
                fieldId: "field-1", in: db)
            try Self.insertIssue(
                id: "item-2:1:field_definition_missing:field-2", itemId: "item-2",
                fieldId: "field-2", in: db)
        }

        try migrator.migrate(queue)

        try queue.read { db in
            let issueIds = try String.fetchAll(
                db, sql: "SELECT id FROM sync_item_issue ORDER BY id")
            let fieldValue: String? = try String.fetchOne(
                db,
                sql: """
                    SELECT value_json
                    FROM item_field_value_base
                    WHERE item_id = 'item-1' AND field_id = 'field-1'
                    """)
            #expect(issueIds == ["item-2:1:field_definition_missing:field-2"])
            #expect(fieldValue == "\"value\"")
        }
    }

    @Test("new pages do not reopen a resolved legacy projection issue")
    func newPagesDoNotReopenResolvedLegacyProjectionIssue() throws {
        let queue = try DatabaseQueue()
        let migrator = ReplicaSchema.migrator()
        try migrator.migrate(queue, upTo: "v16_sync_item_issues")
        try queue.write { db in
            try Self.insertCatalogueField(in: db)
            try db.execute(
                sql: """
                    INSERT INTO item_field_value_base
                        (item_id, field_id, source, ordinal, catalogue_revision, value_json)
                    VALUES ('item-1', 'field-1', 'stored', 0, 1, '"value"')
                    """)
            let resolved = InventorySyncIssue(
                itemId: "item-1", itemName: "item-1", seq: 1,
                code: "field_definition_missing", fieldId: "field-1", fieldKey: nil,
                message: "legacy", itemApplied: true, retryable: true)
            let unresolved = InventorySyncIssue(
                itemId: "item-2", itemName: "item-2", seq: 1,
                code: "field_definition_missing", fieldId: "field-2", fieldKey: nil,
                message: "legacy", itemApplied: true, retryable: true)
            try SyncIssueRows.replace(
                [resolved, unresolved], itemIds: ["item-1", "item-2"], now: Date(), in: db)
        }

        try queue.read { db in
            let issueIds = try SyncIssueRows.read(in: db).map(\.id)
            #expect(issueIds == ["item-2:1:field_definition_missing:field-2"])
        }
    }

    private static func insertCatalogueField(in db: Database) throws {
        try db.execute(
            sql: """
                INSERT INTO catalogue_revision (revision, base_revision, status, minimum_protocol)
                VALUES (1, NULL, 'published', 2)
                """)
        try db.execute(
            sql: """
                INSERT INTO catalogue_type
                    (revision, id, key, label, sort_order, capabilities, legacy_labels,
                     presentation, archived_at, replaced_by, parent_id)
                VALUES (1, 'type-1', 'book', 'Book', 0, ?, ?, ?, NULL, NULL, NULL)
                """,
            arguments: [
                try StoredJSON.encode([String]()), try StoredJSON.encode([String]()),
                try StoredJSON.encode(InventoryJSON.object([:])),
            ])
        try db.execute(
            sql: """
                INSERT INTO catalogue_field
                    (revision, id, type_id, key, label, help, sort_order, kind, cardinality,
                     required, storage, fixed_unit, reference_kinds, reference_type_ids,
                     expression_version, expression, allow_override, presentation, archived_at)
                VALUES (1, 'field-1', 'type-1', 'author', 'Author', NULL, 0, 'short_text',
                        'one', 0, 'stored', NULL, '[]', '[]', NULL, NULL, 0, '{}', NULL)
                """)
    }

    private static func insertIssue(
        id: String, itemId: String, fieldId: String, in db: Database
    ) throws {
        try db.execute(
            sql: """
                INSERT INTO sync_item_issue
                    (id, item_id, item_name, seq, code, field_id, field_key, message,
                     item_applied, retryable, opened_at)
                VALUES (?, ?, ?, 1, 'field_definition_missing', ?, NULL, 'legacy', 1, 1, 0)
                """,
            arguments: [id, itemId, itemId, fieldId])
    }
}
