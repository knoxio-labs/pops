import AppCore
import Foundation
import GRDB

internal enum ReplicaItemPageSummaryReader {
    static func read(createdSince: Date, in db: Database) throws -> InventoryItemPageSummary {
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
}
