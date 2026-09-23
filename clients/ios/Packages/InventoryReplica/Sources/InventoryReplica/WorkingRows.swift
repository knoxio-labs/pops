import AppCore
import Foundation

/// One entity the mutation log can touch, as a key that survives a round
/// trip through a JSON column.
internal struct EntityRef: Codable, Hashable, Sendable {
    let kind: String
    let id: String

    static func item(_ id: String) -> Self { Self(kind: "item", id: id) }
    static func location(_ id: String) -> Self { Self(kind: "location", id: id) }
}

/// A field the local reducer compares and restores by name, the way the
/// server's field codecs do: a change that leaves every tracked field equal
/// writes no event and bumps no revision.
internal struct TrackedField<Root>: Sendable {
    let name: String
    let differs: @Sendable (Root, Root) -> Bool
    let copy: @Sendable (inout Root, Root) -> Void

    static func on<Value: Equatable & Sendable>(
        _ name: String, _ path: WritableKeyPath<Root, Value> & Sendable
    ) -> Self {
        Self(
            name: name, differs: { $0[keyPath: path] != $1[keyPath: path] },
            copy: { $0[keyPath: path] = $1[keyPath: path] })
    }
}

/// A row the reducer edits: an item or a location, with the fields it
/// tracks and the revision a recorded change bumps.
internal protocol WorkingRow: Codable, Equatable, Sendable {
    static var tracked: [TrackedField<Self>] { get }
    var ref: EntityRef { get }
    var revision: Int { get set }
    var snapshot: EntitySnapshot { get }
    /// Sets what the server's write stamps besides the changed fields.
    mutating func stamp(at now: Double, changedFrom previous: Self)
}

extension WorkingRow {
    func changedFields(to after: Self) -> [String] {
        Self.tracked.filter { $0.differs(self, after) }.map(\.name)
    }

    /// `self` with `fields` taken from `source`, every other field kept.
    func restoring(_ fields: [String], from source: Self) -> Self {
        var restored = self
        for field in Self.tracked where fields.contains(field.name) {
            field.copy(&restored, source)
        }
        return restored
    }
}

internal struct StoredContainment: Codable, Equatable {
    var access: String
    var isFull: Bool
}

internal enum StoredDocuments: Codable, Equatable {
    case linked([String])
    case none
    case unavailable
}

/// A mutable, storable copy of one item row, in the stored twins' shapes so
/// the log can keep a before and after of what a change did. Dates are
/// `timeIntervalSinceReferenceDate`, as the row stores them.
internal struct WorkingItem: WorkingRow {
    var id: String
    var revision: Int
    var seq: Int
    var catalogueRevision: Int?
    var name: String
    var typeId: String?
    var typeKey: String?
    var fieldValues: [InventoryItemFieldEntry]
    /// Read-only: no command sets it, so it is not a tracked field. Optional
    /// in the stored JSON too, which a log entry written before the column
    /// existed simply lacks.
    var legacyType: String?
    var fields: [String: StoredFieldValue]
    var note: String?
    var code: String?
    var externalIds: [StoredExternalIdentifier]
    var quantity: Int
    var lifecycle: String
    var lifecycleChangedAt: Double?
    var placement: StoredPlacement
    var previousPlacement: StoredPreviousPlacement?
    var containment: StoredContainment?
    var photos: [StoredPhoto]
    var provenance: StoredProvenance?
    var documents: StoredDocuments
    var documentTitles: [String]
    var createdAt: Double
    var updatedAt: Double
    var deletedAt: Double?

    static let tracked: [TrackedField<Self>] = [
        .on("name", \.name), .on("catalogueRevision", \.catalogueRevision),
        .on("typeId", \.typeId), .on("typeKey", \.typeKey), .on("fieldValues", \.fieldValues),
        .on("fields", \.fields),
        .on("note", \.note), .on("code", \.code), .on("externalIds", \.externalIds),
        .on("quantity", \.quantity), .on("lifecycle", \.lifecycle),
        .on("placement", \.placement), .on("previousPlacement", \.previousPlacement),
        .on("containment", \.containment), .on("photos", \.photos),
        .on("deletedAt", \.deletedAt),
    ]

    var ref: EntityRef { .item(id) }
    var isDeleted: Bool { deletedAt != nil }
    var isContainer: Bool { containment != nil }
    var snapshot: EntitySnapshot { .item(self) }

    /// `updated_at`, and `lifecycle_changed_at` when the lifecycle moved, as
    /// the server's lifecycle codec stamps it.
    mutating func stamp(at now: Double, changedFrom previous: Self) {
        updatedAt = now
        if lifecycle != previous.lifecycle { lifecycleChangedAt = now }
    }
}

extension WorkingItem {
    init(_ item: InventoryItem) {
        self.init(
            id: item.id, revision: item.revision, seq: item.seq,
            catalogueRevision: item.catalogueRevision, name: item.name, typeId: item.typeId,
            typeKey: item.typeKey, fieldValues: item.fieldValues, legacyType: item.legacyType,
            fields: item.fields.mapValues(StoredFieldValue.init),
            note: item.note, code: item.code,
            externalIds: item.externalIds.map {
                StoredExternalIdentifier(kind: $0.kind, value: $0.value)
            },
            quantity: item.quantity.count, lifecycle: item.lifecycle.storageValue,
            lifecycleChangedAt: item.lifecycleChangedAt.map(storedDate),
            placement: StoredPlacement(item.placement),
            previousPlacement: item.previousPlacement.map(StoredPreviousPlacement.init),
            containment: item.containment.map {
                StoredContainment(access: $0.access.storageValue, isFull: $0.isFull)
            },
            photos: item.photos.map { StoredPhoto(sha256: $0.sha256, caption: $0.caption) },
            provenance: item.provenance.map(StoredProvenance.init),
            documents: StoredDocuments(item.documentsStatus), documentTitles: item.documentTitles,
            createdAt: storedDate(item.createdAt), updatedAt: storedDate(item.updatedAt),
            deletedAt: item.deletedAt.map(storedDate))
    }

    var item: InventoryItem {
        InventoryItem(
            id: id, revision: revision, seq: seq, catalogueRevision: catalogueRevision,
            name: name, typeId: typeId, typeKey: typeKey, fieldValues: fieldValues,
            legacyType: legacyType, fields: fields.mapValues(\.domainValue), note: note, code: code,
            externalIds: externalIds.map {
                InventoryExternalIdentifier(kind: $0.kind, value: $0.value)
            },
            quantity: InventoryQuantity(count: quantity),
            lifecycle: InventoryLifecycle(wire: lifecycle),
            lifecycleChangedAt: lifecycleChangedAt.map(Date.init(timeIntervalSinceReferenceDate:)),
            placement: placement.domainValue, previousPlacement: previousPlacement?.domainValue,
            containment: containment.map {
                InventoryContainment(access: InventoryAccess(wire: $0.access), isFull: $0.isFull)
            },
            photos: photos.map { InventoryPhotoReference(sha256: $0.sha256, caption: $0.caption) },
            provenance: provenance?.domainValue, documentsStatus: documents.domainValue,
            documentTitles: documentTitles,
            createdAt: Date(timeIntervalSinceReferenceDate: createdAt),
            updatedAt: Date(timeIntervalSinceReferenceDate: updatedAt),
            deletedAt: deletedAt.map(Date.init(timeIntervalSinceReferenceDate:)))
    }
}

extension StoredDocuments {
    init(_ status: InventoryDocumentsStatus) {
        switch status {
        case .linked(let titles): self = .linked(titles)
        case .none: self = .none
        case .unavailable: self = .unavailable
        }
    }

    var domainValue: InventoryDocumentsStatus {
        switch self {
        case .linked(let titles): .linked(titles)
        case .none: .none
        case .unavailable: .unavailable
        }
    }
}

/// A mutable, storable copy of one location row.
internal struct WorkingLocation: WorkingRow {
    var id: String
    var revision: Int
    var seq: Int
    var name: String
    var parentId: String?
    var sortOrder: Int
    var deletedAt: Double?

    static let tracked: [TrackedField<Self>] = [
        .on("name", \.name), .on("parentId", \.parentId), .on("sortOrder", \.sortOrder),
        .on("deletedAt", \.deletedAt),
    ]

    var ref: EntityRef { .location(id) }
    var isDeleted: Bool { deletedAt != nil }
    var snapshot: EntitySnapshot { .location(self) }

    /// A location row carries no timestamp the phone stores besides its
    /// tombstone, which is itself a tracked field.
    mutating func stamp(at now: Double, changedFrom previous: Self) {}
}

extension WorkingLocation {
    init(_ location: InventoryLocation) {
        self.init(
            id: location.id, revision: location.revision, seq: location.seq, name: location.name,
            parentId: location.parentId, sortOrder: location.sortOrder,
            deletedAt: location.deletedAt.map(storedDate))
    }

    var location: InventoryLocation {
        InventoryLocation(
            id: id, revision: revision, seq: seq, name: name, parentId: parentId,
            sortOrder: sortOrder,
            deletedAt: deletedAt.map(Date.init(timeIntervalSinceReferenceDate:)))
    }
}
