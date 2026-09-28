import AppCore
import Foundation
import GRDB

extension ReplicaSchema {
    /// Stores item-specific server projection problems until a later page or a
    /// targeted retry resolves them.
    static func registerSyncIssues(in migrator: inout DatabaseMigrator) {
        migrator.registerMigration("v16_sync_item_issues") { db in
            try db.execute(
                sql: """
                    CREATE TABLE \(syncIssueTableName) (
                        id TEXT PRIMARY KEY NOT NULL,
                        item_id TEXT NOT NULL,
                        item_name TEXT NOT NULL,
                        seq INTEGER NOT NULL,
                        code TEXT NOT NULL,
                        field_id TEXT,
                        field_key TEXT,
                        message TEXT NOT NULL,
                        item_applied INTEGER NOT NULL CHECK (item_applied IN (0, 1)),
                        retryable INTEGER NOT NULL CHECK (retryable IN (0, 1)),
                        opened_at REAL NOT NULL
                    );
                    CREATE INDEX sync_item_issue_item ON \(syncIssueTableName)(item_id);
                    """)
        }
    }
}

internal enum SyncIssueRows {
    static func replace(
        _ issues: [InventorySyncIssue], itemIds: Set<String>, now: Date, in db: Database
    ) throws {
        for itemId in itemIds {
            try db.execute(
                sql: "DELETE FROM \(ReplicaSchema.syncIssueTableName) WHERE item_id = ?",
                arguments: [itemId])
        }
        for issue in issues {
            try db.execute(
                sql: """
                    INSERT INTO \(ReplicaSchema.syncIssueTableName)
                        (id, item_id, item_name, seq, code, field_id, field_key, message,
                         item_applied, retryable, opened_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        item_id = excluded.item_id,
                        item_name = excluded.item_name,
                        seq = excluded.seq,
                        code = excluded.code,
                        field_id = excluded.field_id,
                        field_key = excluded.field_key,
                        message = excluded.message,
                        item_applied = excluded.item_applied,
                        retryable = excluded.retryable,
                        opened_at = excluded.opened_at
                    """,
                arguments: [
                    issue.id, issue.itemId, issue.itemName, issue.seq, issue.code, issue.fieldId,
                    issue.fieldKey, issue.message, issue.itemApplied, issue.retryable,
                    storedDate(now),
                ])
        }
    }

    static func read(in db: Database) throws -> [InventorySyncIssue] {
        try Row.fetchAll(
            db,
            sql: "SELECT * FROM \(ReplicaSchema.syncIssueTableName) ORDER BY opened_at, id"
        ).map { row in
            InventorySyncIssue(
                itemId: row["item_id"], itemName: row["item_name"], seq: row["seq"],
                code: row["code"], fieldId: row["field_id"], fieldKey: row["field_key"],
                message: row["message"], itemApplied: row["item_applied"],
                retryable: row["retryable"])
        }
    }
}
