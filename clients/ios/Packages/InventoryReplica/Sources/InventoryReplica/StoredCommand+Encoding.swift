import AppCore

// Split into groups of cases, as `BFMInventoryCommandEncoding` is, to keep
// each switch under the cyclomatic-complexity cap: every case is an
// independent one-line mapping with nothing shared between them.

extension StoredCommand {
    init(_ logged: LoggedCommand) {
        switch logged {
        case .undo(let target):
            self = .undo(of: target)
        case .command(let command):
            self =
                Self.protocol2ItemWrite(command) ?? Self.itemWrite(command)
                ?? Self.itemAux(command) ?? Self.locationOrEvent(command)
        }
    }

    private static func protocol2ItemWrite(_ command: InventoryCommand) -> StoredCommand? {
        switch command {
        case .createProtocol2Item(let new):
            .createProtocol2Item(
                id: new.id, name: new.name, catalogueRevision: new.catalogueRevision,
                typeId: new.typeId, values: new.values, note: new.note,
                externalIds: new.externalIds.map(StoredExternalIdentifier.init),
                quantity: new.quantity, placement: StoredPlacement(new.placement), code: new.code)
        case .editProtocol2Item(let id, let catalogueRevision, let values):
            .editProtocol2Item(id: id, catalogueRevision: catalogueRevision, values: values)
        case .changeProtocol2ItemType(let id, let catalogueRevision, let typeId, let values):
            .changeProtocol2ItemType(
                id: id, catalogueRevision: catalogueRevision, typeId: typeId, values: values)
        default: nil
        }
    }

    private static func itemWrite(_ command: InventoryCommand) -> StoredCommand? {
        switch command {
        case .createItem(let new):
            .createItem(
                id: new.id, name: new.name, typeKey: new.typeKey,
                fields: new.fields.mapValues(StoredFieldValue.init), note: new.note,
                externalIds: new.externalIds.map(StoredExternalIdentifier.init),
                quantity: new.quantity, placement: StoredPlacement(new.placement), code: new.code)
        case .editItem(let id, let name, let note, let fields, let externalIds):
            .editItem(
                id: id, name: name, note: StoredNoteUpdate(note),
                fields: fields.mapValues { $0.map { .set(StoredFieldValue($0)) } ?? .remove },
                externalIds: externalIds?.map(StoredExternalIdentifier.init))
        case .changeItemType(let id, let typeKey, let fields):
            .changeItemType(
                id: id, typeKey: typeKey, fields: fields.mapValues(StoredFieldValue.init))
        case .setItemCode(let id, let code): .setItemCode(id: id, code: code)
        case .moveItem(let id, let to, let verb):
            .moveItem(id: id, to: StoredPlacement(to), verb: verb.wireValue)
        case .setItemAccess(let id, let access):
            .setItemAccess(id: id, access: access.storageValue)
        case .setItemFull(let id, let isFull): .setItemFull(id: id, isFull: isFull)
        case .setItemLifecycle(let id, let lifecycle, let reason):
            .setItemLifecycle(
                id: id, lifecycle: lifecycle.storageValue, reason: reason?.storageValue)
        case .setItemQuantity(let id, let quantity): .setItemQuantity(id: id, quantity: quantity)
        default: nil
        }
    }

    private static func itemAux(_ command: InventoryCommand) -> StoredCommand? {
        switch command {
        case .splitItem(let id, let newItemId, let quantity):
            .splitItem(id: id, newItemId: newItemId, quantity: quantity)
        case .attachPhoto(let id, let sha256, let position):
            .attachPhoto(itemId: id, sha256: sha256, position: position)
        case .removePhoto(let id, let sha256): .removePhoto(itemId: id, sha256: sha256)
        case .reorderPhotos(let id, let sha256s): .reorderPhotos(itemId: id, sha256s: sha256s)
        case .restoreDeletedItem(let id): .restoreDeletedItem(id: id)
        case .deleteItem(let id): .deleteItem(id: id)
        case .setComputedOverride(let id, let fieldId, let value):
            .setComputedOverride(id: id, fieldId: fieldId, value: value)
        case .clearComputedOverride(let id, let fieldId):
            .clearComputedOverride(id: id, fieldId: fieldId)
        default: nil
        }
    }

    private static func locationOrEvent(_ command: InventoryCommand) -> StoredCommand {
        switch command {
        case .createLocation(let new):
            .createLocation(
                id: new.id, name: new.name, parentId: new.parentId, sortOrder: new.sortOrder)
        case .renameLocation(let id, let name): .renameLocation(id: id, name: name)
        case .moveLocation(let id, let parentId): .moveLocation(id: id, parentId: parentId)
        case .deleteLocation(let id): .deleteLocation(id: id)
        case .revertEvent(let seq, let kind, let id):
            .revertEvent(seq: seq, entityKind: kind.storageValue, entityId: id)
        default:
            preconditionFailure("every other case is covered by itemWrite/itemAux")
        }
    }
}

extension StoredNoteUpdate {
    init(_ update: InventoryFieldUpdate<String>) {
        switch update {
        case .unchanged: self = .unchanged
        case .set(let note): self = .set(note)
        case .cleared: self = .cleared
        }
    }

    var domainValue: InventoryFieldUpdate<String> {
        switch self {
        case .unchanged: .unchanged
        case .set(let note): .set(note)
        case .cleared: .cleared
        }
    }
}
