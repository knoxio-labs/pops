import AppCore

extension StoredCommand {
    /// The command this row replays.
    ///
    /// - Throws: ``InventoryReplicaError/corruptValue(_:)`` for a verb or
    ///   entity kind this build never writes, which only corruption produces.
    func logged() throws -> LoggedCommand {
        if case .undo(let target) = self { return .undo(of: target) }
        if let command = itemWrite() ?? protocol2ItemWrite() ?? itemAux() {
            return .command(command)
        }
        return .command(try locationOrEvent())
    }

    private func itemWrite() -> InventoryCommand? {
        switch self {
        case .createItem(
            let id, let name, let typeKey, let fields, let note, let externalIds, let quantity,
            let to, let code):
            .createItem(
                InventoryNewItem(
                    id: id, name: name, typeKey: typeKey, fields: fields.mapValues(\.domainValue),
                    note: note, externalIds: externalIds.map(\.domainValue), quantity: quantity,
                    placement: to.domainValue, code: code))
        case .editItem(let id, let name, let note, let fields, let externalIds):
            .editItem(
                id: id, name: name, note: note.domainValue,
                fields: fields.mapValues(\.domainValue),
                externalIds: externalIds?.map(\.domainValue))
        case .changeItemType(let id, let typeKey, let fields):
            .changeItemType(id: id, typeKey: typeKey, fields: fields.mapValues(\.domainValue))
        case .setItemCode(let id, let code): .setItemCode(id: id, code: code)
        case .setItemAccess(let id, let access):
            .setItemAccess(id: id, access: InventoryAccess(wire: access))
        case .setItemFull(let id, let isFull): .setItemFull(id: id, isFull: isFull)
        case .setItemLifecycle(let id, let lifecycle, let reason):
            .setItemLifecycle(
                id: id, lifecycle: InventoryLifecycle(wire: lifecycle),
                reason: reason.map(InventoryDiscardReason.init(wire:)))
        case .setItemQuantity(let id, let quantity): .setItemQuantity(id: id, quantity: quantity)
        default: nil
        }
    }

    private func protocol2ItemWrite() -> InventoryCommand? {
        switch self {
        case .createProtocol2Item(
            let id, let name, let catalogueRevision, let typeId, let values, let note,
            let externalIds, let quantity, let placement, let code, let overrides):
            .createProtocol2Item(
                .init(
                    id: id, name: name, catalogueRevision: catalogueRevision, typeId: typeId,
                    values: values, overrides: overrides ?? [], note: note,
                    externalIds: externalIds.map(\.domainValue), quantity: quantity,
                    placement: placement.domainValue, code: code))
        case .editProtocol2Item(let id, let catalogueRevision, let values):
            .editProtocol2Item(id: id, catalogueRevision: catalogueRevision, values: values)
        case .changeProtocol2ItemType(let id, let catalogueRevision, let typeId, let values):
            .changeProtocol2ItemType(
                id: id, catalogueRevision: catalogueRevision, typeId: typeId, values: values)
        default: nil
        }
    }

    private func itemAux() -> InventoryCommand? {
        switch self {
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

    private func locationOrEvent() throws -> InventoryCommand {
        switch self {
        case .moveItem(let id, let to, let verb):
            guard let verb = InventoryMoveVerb(wire: verb) else {
                throw InventoryReplicaError.corruptValue("move verb \(verb)")
            }
            return .moveItem(id: id, to: to.domainValue, verb: verb)
        case .createLocation(let id, let name, let parentId, let sortOrder):
            return .createLocation(
                InventoryNewLocation(id: id, name: name, parentId: parentId, sortOrder: sortOrder))
        case .renameLocation(let id, let name): return .renameLocation(id: id, name: name)
        case .moveLocation(let id, let parentId): return .moveLocation(id: id, parentId: parentId)
        case .deleteLocation(let id): return .deleteLocation(id: id)
        case .revertEvent(let seq, let kind, let id):
            guard let kind = InventoryEntityKind(storageValue: kind) else {
                throw InventoryReplicaError.corruptValue("entity kind \(kind)")
            }
            return .revertEvent(seq: seq, entityKind: kind, entityId: id)
        default:
            throw InventoryReplicaError.corruptValue("stored command \(self)")
        }
    }
}

extension StoredFieldPatch {
    var domainValue: InventoryFieldValue? {
        switch self {
        case .set(let value): value.domainValue
        case .remove: nil
        }
    }
}
