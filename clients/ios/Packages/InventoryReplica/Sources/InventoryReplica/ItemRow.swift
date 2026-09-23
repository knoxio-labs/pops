import AppCore
import Foundation
import GRDB

/// How one `InventoryItem` maps onto a row of either item layer. Dates are
/// stored as `timeIntervalSinceReferenceDate`, which is the `Double` a `Date`
/// already is, so a value reads back equal to the one written.
internal enum ItemRow {
    static let columns = [
        "id", "revision", "seq", "name", "type_key", "fields", "note", "code", "external_ids",
        "quantity", "lifecycle", "lifecycle_changed_at", "placement_kind", "location_id",
        "containing_item_id", "previous_placement_kind", "previous_placement_id", "is_container",
        "access", "is_full", "photos", "provenance", "documents_status", "documents_linked",
        "document_titles", "created_at", "updated_at", "deleted_at", "legacy_type",
        "catalogue_revision", "type_id",
    ]

    static func values(of item: InventoryItem) throws -> [(any DatabaseValueConvertible)?] {
        let placement = placementColumns(item.placement)
        let previous = previousColumns(item.previousPlacement)
        let documents = documentColumns(item.documentsStatus)
        return [
            item.id, item.revision, item.seq, item.name, item.typeKey,
            try StoredFieldValue.encode(item.fields), item.note, item.code,
            try StoredJSON.encode(
                item.externalIds.map { StoredExternalIdentifier(kind: $0.kind, value: $0.value) }),
            item.quantity.count, item.lifecycle.storageValue,
            item.lifecycleChangedAt.map(storedDate),
            placement.kind, placement.kind == "location" ? placement.reference : nil,
            placement.kind == "container" ? placement.reference : nil, previous.kind, previous.id,
            item.isContainer, item.containment?.access.storageValue, item.containment?.isFull,
            try StoredJSON.encode(
                item.photos.map { StoredPhoto(sha256: $0.sha256, caption: $0.caption) }),
            try item.provenance.map { try StoredJSON.encode(StoredProvenance($0)) },
            documents.status, try StoredJSON.encode(documents.linked),
            try StoredJSON.encode(item.documentTitles),
            storedDate(item.createdAt), storedDate(item.updatedAt), item.deletedAt.map(storedDate),
            item.legacyType, item.catalogueRevision, item.typeId,
        ]
    }

    /// Decodes a row read from either layer. A remembered previous placement
    /// whose target has since been tombstoned reads as `.tombstoned` (D2's
    /// "Previous place deleted"), which is why this needs the database and
    /// not only the row. With `db` nil it is read exactly as stored, target
    /// id and all, which is what the local reducer needs to write the row
    /// back without losing the reference.
    static func decode(_ row: Row, in db: Database?) throws -> InventoryItem {
        let id: String = try row.decode(forColumn: "id")
        return InventoryItem(
            id: id, revision: try row.decode(forColumn: "revision"),
            seq: try row.decode(forColumn: "seq"),
            catalogueRevision: try row.decode(forColumn: "catalogue_revision"),
            name: try row.decode(forColumn: "name"), typeId: try row.decode(forColumn: "type_id"),
            typeKey: try row.decode(forColumn: "type_key"),
            fieldValues: try db.map {
                try Protocol2FieldValueRows.read(
                    itemId: id, from: "item_field_value", in: $0)
            } ?? [],
            computedValues: try db.map { try ComputedValueRows.read(itemId: id, in: $0) } ?? [],
            legacyType: try row.decode(forColumn: "legacy_type"),
            fields: try StoredFieldValue.decodeFields(try row.decode(forColumn: "fields")),
            note: try row.decode(forColumn: "note"), code: try row.decode(forColumn: "code"),
            externalIds: try externalIds(row),
            quantity: InventoryQuantity(count: try row.decode(forColumn: "quantity")),
            lifecycle: InventoryLifecycle(wire: try row.decode(forColumn: "lifecycle")),
            lifecycleChangedAt: try date(row, "lifecycle_changed_at"),
            placement: try placement(row, id: id),
            previousPlacement: try previousPlacement(row, in: db),
            containment: try containment(row), photos: try photos(row),
            provenance: try provenance(row), documentsStatus: try documentsStatus(row),
            documentTitles: try StoredJSON.decode(
                [String].self, from: try row.decode(forColumn: "document_titles")),
            createdAt: try requiredDate(row, "created_at"),
            updatedAt: try requiredDate(row, "updated_at"),
            deletedAt: try date(row, "deleted_at"))
    }
}

internal func storedDate(_ date: Date) -> Double { date.timeIntervalSinceReferenceDate }

internal func date(_ row: Row, _ column: String) throws -> Date? {
    let stored: Double? = try row.decode(forColumn: column)
    return stored.map(Date.init(timeIntervalSinceReferenceDate:))
}

internal func requiredDate(_ row: Row, _ column: String) throws -> Date {
    Date(timeIntervalSinceReferenceDate: try row.decode(forColumn: column))
}

extension ItemRow {
    private static func placementColumns(
        _ placement: InventoryPlacement
    ) -> (kind: String, reference: String?) {
        switch placement {
        case .location(let id): ("location", id)
        case .container(let id): ("container", id)
        case .hand: ("hand", nil)
        }
    }

    private static func previousColumns(
        _ previous: InventoryPreviousPlacement?
    ) -> (kind: String?, id: String?) {
        switch previous {
        case .location(let id): ("location", id)
        case .container(let id): ("container", id)
        case .tombstoned: ("tombstoned", nil)
        case nil: (nil, nil)
        }
    }

    private static func documentColumns(
        _ status: InventoryDocumentsStatus
    ) -> (status: String, linked: [String]) {
        switch status {
        case .linked(let titles): ("linked", titles)
        case .none: ("none", [])
        case .unavailable: ("unavailable", [])
        }
    }

    private static func placement(_ row: Row, id: String) throws -> InventoryPlacement {
        let kind: String = try row.decode(forColumn: "placement_kind")
        let location: String? = try row.decode(forColumn: "location_id")
        let container: String? = try row.decode(forColumn: "containing_item_id")
        switch (kind, location, container) {
        case ("location", let location?, nil): return .location(location)
        case ("container", nil, let container?): return .container(container)
        case ("hand", nil, nil): return .hand
        default: throw InventoryReplicaError.corruptValue("placement of item \(id)")
        }
    }

    private static func previousPlacement(
        _ row: Row, in db: Database?
    ) throws -> InventoryPreviousPlacement? {
        let kind: String? = try row.decode(forColumn: "previous_placement_kind")
        let id: String? = try row.decode(forColumn: "previous_placement_id")
        switch (kind, id) {
        case (nil, _): return nil
        case ("tombstoned", _): return .tombstoned
        case ("location", let id?):
            return try isTombstoned(id, in: "location", db) ? .tombstoned : .location(id)
        case ("container", let id?):
            return try isTombstoned(id, in: "item", db) ? .tombstoned : .container(id)
        default: throw InventoryReplicaError.corruptValue("previous placement \(kind ?? "")")
        }
    }

    private static func isTombstoned(_ id: String, in table: String, _ db: Database?) throws -> Bool
    {
        guard let db else { return false }
        return try Bool.fetchOne(
            db, sql: "SELECT deleted_at IS NOT NULL FROM \(table) WHERE id = ?", arguments: [id]
        ) ?? false
    }

    private static func containment(_ row: Row) throws -> InventoryContainment? {
        guard try row.decode(Bool.self, forColumn: "is_container") else { return nil }
        let access: String = try row.decode(forColumn: "access")
        return InventoryContainment(
            access: InventoryAccess(wire: access), isFull: try row.decode(forColumn: "is_full"))
    }

    private static func externalIds(_ row: Row) throws -> [InventoryExternalIdentifier] {
        try StoredJSON.decode(
            [StoredExternalIdentifier].self, from: try row.decode(forColumn: "external_ids")
        )
        .map { InventoryExternalIdentifier(kind: $0.kind, value: $0.value) }
    }

    private static func photos(_ row: Row) throws -> [InventoryPhotoReference] {
        try StoredJSON.decode([StoredPhoto].self, from: try row.decode(forColumn: "photos"))
            .map { InventoryPhotoReference(sha256: $0.sha256, caption: $0.caption) }
    }

    private static func provenance(_ row: Row) throws -> InventoryProvenance? {
        let stored: String? = try row.decode(forColumn: "provenance")
        return try stored.map { try StoredJSON.decode(StoredProvenance.self, from: $0).domainValue }
    }

    private static func documentsStatus(_ row: Row) throws -> InventoryDocumentsStatus {
        let status: String = try row.decode(forColumn: "documents_status")
        switch status {
        case "linked":
            return .linked(
                try StoredJSON.decode(
                    [String].self, from: try row.decode(forColumn: "documents_linked")))
        case "none": return .none
        case "unavailable": return .unavailable
        default: throw InventoryReplicaError.corruptValue("documents status \(status)")
        }
    }
}
