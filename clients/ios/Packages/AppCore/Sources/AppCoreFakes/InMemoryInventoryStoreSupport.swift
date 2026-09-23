import AppCore
import Foundation

/// A patch to one of `InventoryItem`/`InventoryLocation`'s fields: left alone,
/// or set to a value (including `nil`, for a field that clears). Plain
/// `Value?` cannot say both at once for an already-optional field, which is
/// why `InventoryCommand.editItem` needed `InventoryFieldUpdate` — this is
/// that same shape, shared by `InMemoryInventoryStore`'s own reducer files.
internal enum FieldPatch<Value> {
    case unchanged
    case set(Value)

    func resolved(against current: Value) -> Value {
        if case .set(let value) = self { return value }
        return current
    }
}

/// The prior value a command's undo log entry needs, or a contract mismatch
/// if the entity it names does not exist.
internal func require<T>(_ value: T?) throws -> T {
    guard let value else { throw RepositoryError.contractMismatch }
    return value
}

internal func bumped(
    _ item: InventoryItem,
    seq: inout Int,
    name: FieldPatch<String> = .unchanged,
    catalogueRevision: FieldPatch<Int?> = .unchanged,
    typeId: FieldPatch<String?> = .unchanged,
    fieldValues: FieldPatch<[InventoryItemFieldEntry]> = .unchanged,
    note: FieldPatch<String?> = .unchanged,
    fields: FieldPatch<[String: InventoryFieldValue]> = .unchanged,
    code: FieldPatch<String?> = .unchanged,
    externalIds: FieldPatch<[InventoryExternalIdentifier]> = .unchanged,
    quantity: FieldPatch<InventoryQuantity> = .unchanged,
    lifecycle: FieldPatch<InventoryLifecycle> = .unchanged,
    lifecycleChangedAt: FieldPatch<Date?> = .unchanged,
    placement: FieldPatch<InventoryPlacement> = .unchanged,
    previousPlacement: FieldPatch<InventoryPreviousPlacement?> = .unchanged,
    containment: FieldPatch<InventoryContainment?> = .unchanged,
    photos: FieldPatch<[InventoryPhotoReference]> = .unchanged,
    deletedAt: FieldPatch<Date?> = .unchanged
) -> InventoryItem {
    seq += 1
    return InventoryItem(
        id: item.id,
        revision: item.revision + 1,
        seq: seq,
        catalogueRevision: catalogueRevision.resolved(against: item.catalogueRevision),
        name: name.resolved(against: item.name),
        typeId: typeId.resolved(against: item.typeId),
        typeKey: item.typeKey,
        fieldValues: fieldValues.resolved(against: item.fieldValues),
        legacyType: item.legacyType,
        fields: fields.resolved(against: item.fields),
        note: note.resolved(against: item.note),
        code: code.resolved(against: item.code),
        externalIds: externalIds.resolved(against: item.externalIds),
        quantity: quantity.resolved(against: item.quantity),
        lifecycle: lifecycle.resolved(against: item.lifecycle),
        lifecycleChangedAt: lifecycleChangedAt.resolved(against: item.lifecycleChangedAt),
        placement: placement.resolved(against: item.placement),
        previousPlacement: previousPlacement.resolved(against: item.previousPlacement),
        containment: containment.resolved(against: item.containment),
        photos: photos.resolved(against: item.photos),
        provenance: item.provenance,
        documentsStatus: item.documentsStatus,
        documentTitles: item.documentTitles,
        createdAt: item.createdAt,
        updatedAt: Date(),
        deletedAt: deletedAt.resolved(against: item.deletedAt))
}

/// A type change is not expressible through `bumped`'s field patches: it also
/// recomputes `containment` as a whole, per ADR-002 D1.
internal func retyped(_ item: InventoryItem, typeKey: String, isContainer: Bool) -> InventoryItem {
    InventoryItem(
        id: item.id, revision: item.revision, seq: item.seq, name: item.name, typeKey: typeKey,
        legacyType: item.legacyType, fields: item.fields, note: item.note, code: item.code,
        externalIds: item.externalIds,
        quantity: item.quantity, lifecycle: item.lifecycle,
        lifecycleChangedAt: item.lifecycleChangedAt, placement: item.placement,
        previousPlacement: item.previousPlacement,
        containment: isContainer
            ? InventoryContainment(
                access: item.containment?.access ?? .open,
                isFull: item.containment?.isFull ?? false)
            : nil,
        photos: item.photos,
        provenance: item.provenance, documentsStatus: item.documentsStatus,
        documentTitles: item.documentTitles, createdAt: item.createdAt, updatedAt: Date(),
        deletedAt: item.deletedAt)
}

internal func protocol2Retyped(
    _ item: InventoryItem, catalogueRevision: Int, typeId: String,
    fieldValues: [InventoryItemFieldEntry], isContainer: Bool
) -> InventoryItem {
    InventoryItem(
        id: item.id, revision: item.revision, seq: item.seq,
        catalogueRevision: catalogueRevision, name: item.name, typeId: typeId, typeKey: nil,
        fieldValues: fieldValues, legacyType: item.legacyType, fields: item.fields,
        note: item.note, code: item.code, externalIds: item.externalIds,
        quantity: item.quantity, lifecycle: item.lifecycle,
        lifecycleChangedAt: item.lifecycleChangedAt, placement: item.placement,
        previousPlacement: item.previousPlacement,
        containment: isContainer
            ? InventoryContainment(
                access: item.containment?.access ?? .open,
                isFull: item.containment?.isFull ?? false)
            : nil,
        photos: item.photos,
        provenance: item.provenance, documentsStatus: item.documentsStatus,
        documentTitles: item.documentTitles, createdAt: item.createdAt, updatedAt: Date(),
        deletedAt: item.deletedAt)
}

internal func bumped(
    _ location: InventoryLocation,
    seq: inout Int,
    name: FieldPatch<String> = .unchanged,
    parentId: FieldPatch<InventoryLocation.ID?> = .unchanged,
    deletedAt: FieldPatch<Date?> = .unchanged
) -> InventoryLocation {
    seq += 1
    return InventoryLocation(
        id: location.id,
        revision: location.revision + 1,
        seq: seq,
        name: name.resolved(against: location.name),
        parentId: parentId.resolved(against: location.parentId),
        sortOrder: location.sortOrder,
        deletedAt: deletedAt.resolved(against: location.deletedAt))
}
