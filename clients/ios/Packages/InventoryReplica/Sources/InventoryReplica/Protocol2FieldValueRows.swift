import AppCore
import Foundation
import GRDB

private struct StoredOptionValue: Codable {
    let optionId: String
}

private struct StoredMeasurementValue: Codable {
    let amount: String
    let unit: String
}

private struct StoredReferenceValue: Codable {
    let targetKind: String
    let targetId: String
}

private struct FieldValueKey: Equatable {
    let fieldId: String
    let source: InventoryValueSource
    let revision: Int
}

internal enum Protocol2FieldValueRows {
    static func replace(
        itemId: String, entries: [InventoryItemFieldEntry], in table: String, _ db: Database
    ) throws {
        precondition(ReplicaSchema.fieldValueLayers.contains(table))
        try db.execute(sql: "DELETE FROM \(table) WHERE item_id = ?", arguments: [itemId])
        for entry in entries {
            guard entry.source == .stored || entry.source == .override,
                case .value(let values) = entry.state
            else { continue }
            for (ordinal, value) in values.enumerated() {
                try db.execute(
                    sql: """
                        INSERT INTO \(table)
                            (item_id, field_id, source, ordinal, catalogue_revision, value_json)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                    arguments: [
                        itemId, entry.fieldId, entry.source.rawValue, ordinal,
                        entry.catalogueRevision, try encode(value),
                    ])
            }
        }
    }

    static func copyBaseToView(itemId: String, in db: Database) throws {
        try db.execute(sql: "DELETE FROM item_field_value WHERE item_id = ?", arguments: [itemId])
        try db.execute(
            sql: """
                INSERT INTO item_field_value
                    (item_id, field_id, source, ordinal, catalogue_revision, value_json)
                SELECT item_id, field_id, source, ordinal, catalogue_revision, value_json
                FROM item_field_value_base WHERE item_id = ?
                """, arguments: [itemId])
    }

    static func read(itemId: String, from table: String, in db: Database) throws
        -> [InventoryItemFieldEntry]
    {
        precondition(ReplicaSchema.fieldValueLayers.contains(table))
        let rows = try rows(itemId: itemId, from: table, in: db)
        var entries: [InventoryItemFieldEntry] = []
        var current: FieldValueKey?
        var values: [InventoryPrimitiveValue] = []
        func appendCurrent() {
            guard let current else { return }
            entries.append(
                InventoryItemFieldEntry(
                    fieldId: current.fieldId, state: .value(values), source: current.source,
                    catalogueRevision: current.revision))
        }
        for row in rows {
            let sourceText: String = try row.decode(forColumn: "source")
            guard let source = InventoryValueSource(rawValue: sourceText), source != .computed
            else {
                throw InventoryReplicaError.corruptValue("field value source \(sourceText)")
            }
            let key = FieldValueKey(
                fieldId: try row.decode(String.self, forColumn: "field_id"), source: source,
                revision: try row.decode(Int.self, forColumn: "catalogue_revision")
            )
            if current != key {
                appendCurrent()
                current = key
                values = []
            }
            let kindText: String = try row.decode(forColumn: "kind")
            guard let kind = InventoryPrimitiveKind(rawValue: kindText) else {
                throw InventoryReplicaError.corruptValue("primitive kind \(kindText)")
            }
            values.append(
                try decode(
                    kind: kind, text: row.decode(forColumn: "value_json"), table: table,
                    in: db))
        }
        appendCurrent()
        return entries
    }

    private static func rows(itemId: String, from table: String, in db: Database) throws -> [Row] {
        try Row.fetchAll(
            db,
            sql: """
                SELECT value.*, field.kind
                FROM \(table) value
                JOIN catalogue_field field
                  ON field.revision = value.catalogue_revision AND field.id = value.field_id
                WHERE value.item_id = ?
                ORDER BY field.sort_order, value.field_id, value.source, value.ordinal
                """, arguments: [itemId])
    }

    private static func encode(_ value: InventoryPrimitiveValue) throws -> String {
        switch value {
        case .string(let value): return try StoredJSON.encode(value)
        case .integer(let value): return try StoredJSON.encode(value.value)
        case .decimal(let value): return try StoredJSON.encode(value.text)
        case .boolean(let value): return try StoredJSON.encode(value)
        case .enumeration(let optionId):
            return try StoredJSON.encode(StoredOptionValue(optionId: optionId))
        case .measurement(let amount, let unit):
            return try StoredJSON.encode(StoredMeasurementValue(amount: amount.text, unit: unit))
        case .date(let value): return try StoredJSON.encode(value.text)
        case .dateTime(let value): return try StoredJSON.encode(value.text)
        case .url(let value): return try StoredJSON.encode(value.text)
        case .reference(let value):
            return try StoredJSON.encode(
                StoredReferenceValue(
                    targetKind: value.targetKind.rawValue, targetId: value.targetId))
        }
    }

    private static func decode(
        kind: InventoryPrimitiveKind, text: String, table: String, in db: Database
    ) throws -> InventoryPrimitiveValue {
        switch kind {
        case .shortText, .longText:
            return .string(try StoredJSON.decode(String.self, from: text))
        case .integer:
            return .integer(try InventoryInteger(StoredJSON.decode(Int64.self, from: text)))
        case .decimal:
            return .decimal(try InventoryDecimal(StoredJSON.decode(String.self, from: text)))
        case .boolean:
            return .boolean(try StoredJSON.decode(Bool.self, from: text))
        case .enumeration:
            return .enumeration(
                optionId: try StoredJSON.decode(StoredOptionValue.self, from: text).optionId)
        case .measurement:
            let value = try StoredJSON.decode(StoredMeasurementValue.self, from: text)
            return .measurement(amount: try InventoryDecimal(value.amount), unit: value.unit)
        case .date:
            return .date(try InventoryCanonicalDate(StoredJSON.decode(String.self, from: text)))
        case .dateTime:
            return .dateTime(
                try InventoryCanonicalDateTime(StoredJSON.decode(String.self, from: text)))
        case .url:
            return .url(try InventoryCanonicalURL(StoredJSON.decode(String.self, from: text)))
        case .reference:
            let value = try StoredJSON.decode(StoredReferenceValue.self, from: text)
            guard let targetKind = InventoryReferenceTargetKind(rawValue: value.targetKind) else {
                throw InventoryReplicaError.corruptValue("reference kind \(value.targetKind)")
            }
            return .reference(
                InventoryReferenceValue(
                    targetKind: targetKind, targetId: value.targetId,
                    targetState: try referenceState(
                        kind: targetKind, id: value.targetId, table: table, in: db)))
        }
    }

    private static func referenceState(
        kind: InventoryReferenceTargetKind, id: String, table: String, in db: Database
    ) throws -> InventoryReferenceState {
        let suffix = table == "item_field_value_base" ? "_base" : ""
        let targetTable = kind == .item ? "item\(suffix)" : "location\(suffix)"
        if let deleted: Bool = try Bool.fetchOne(
            db, sql: "SELECT deleted_at IS NOT NULL FROM \(targetTable) WHERE id = ?",
            arguments: [id])
        {
            return deleted ? .deleted : .resolved
        }
        let meta = try SyncMeta.read(db)
        return meta.since == nil || meta.snapshotCursor != nil ? .unresolved : .missing
    }
}
