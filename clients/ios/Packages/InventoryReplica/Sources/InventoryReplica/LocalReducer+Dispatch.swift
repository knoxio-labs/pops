import AppCore

// Grouped like `StoredCommand+Encoding.swift`, for the same
// cyclomatic-complexity reason.

extension LocalReducer {
    func run(_ command: LoggedCommand) throws -> Written {
        switch command {
        case .undo(let target):
            return try undo(of: target)
        case .command(let command):
            if let written = try runProtocol2ItemWrite(command) { return written }
            if let written = try runItemWrite(command) { return written }
            if let written = try runItemAux(command) { return written }
            return try runLocationOrEvent(command)
        }
    }

    private func runProtocol2ItemWrite(_ command: InventoryCommand) throws -> Written? {
        switch command {
        case .createProtocol2Item(let new): try createProtocol2Item(new)
        case .editProtocol2Item(let id, let revision, let values):
            try editProtocol2Item(id: id, catalogueRevision: revision, values: values)
        case .changeProtocol2ItemType(let id, let revision, let typeId, let values):
            try changeProtocol2ItemType(
                id: id, catalogueRevision: revision, typeId: typeId, values: values)
        default: nil
        }
    }

    /// Whether the server judges this op against the mutation's base
    /// revision. The others (a create, a restore, the photo ops, a revert)
    /// are judged by the op itself, and the command vectors send them none.
    static func sendsBaseRevision(_ command: InventoryCommand) -> Bool {
        switch command {
        case .createItem, .createProtocol2Item, .createLocation, .restoreDeletedItem,
            .revertEvent, .attachPhoto, .removePhoto, .reorderPhotos:
            false
        default:
            true
        }
    }

    private func runItemWrite(_ command: InventoryCommand) throws -> Written? {
        switch command {
        case .createItem(let new): try createItem(new)
        case .editItem(let id, let name, let note, let fields, let externalIds):
            try editItem(
                id: id, name: name, note: note, fields: fields, externalIds: externalIds)
        case .changeItemType(let id, let typeKey, let fields):
            try changeItemType(id: id, typeKey: typeKey, fields: fields)
        case .setItemCode(let id, let code): try setItemCode(id: id, code: code)
        case .moveItem(let id, let to, let verb): try moveItem(id: id, to: to, verb: verb)
        case .setItemAccess(let id, let access): try setItemAccess(id: id, access: access)
        case .setItemFull(let id, let isFull): try setItemFull(id: id, isFull: isFull)
        case .setItemLifecycle(let id, let lifecycle, let reason):
            try setItemLifecycle(id: id, lifecycle: lifecycle, reason: reason)
        case .setItemQuantity(let id, let quantity): try setItemQuantity(id: id, quantity: quantity)
        default: nil
        }
    }

    private func runItemAux(_ command: InventoryCommand) throws -> Written? {
        switch command {
        case .splitItem(let id, let newItemId, let quantity):
            try splitItem(id: id, newItemId: newItemId, quantity: quantity)
        case .attachPhoto(let id, let sha256, let position):
            try attachPhoto(itemId: id, sha256: sha256, position: position)
        case .removePhoto(let id, let sha256): try removePhoto(itemId: id, sha256: sha256)
        case .reorderPhotos(let id, let sha256s): try reorderPhotos(itemId: id, sha256s: sha256s)
        case .restoreDeletedItem(let id): try restoreDeletedItem(id: id)
        case .deleteItem(let id): try deleteItem(id: id)
        case .setComputedOverride(let id, let fieldId, let value):
            try setComputedOverride(id: id, fieldId: fieldId, value: value)
        case .clearComputedOverride(let id, let fieldId):
            try clearComputedOverride(id: id, fieldId: fieldId)
        default: nil
        }
    }

    private func runLocationOrEvent(_ command: InventoryCommand) throws -> Written {
        switch command {
        case .createLocation(let new): try createLocation(new)
        case .renameLocation(let id, let name): try renameLocation(id: id, name: name)
        case .moveLocation(let id, let parentId): try moveLocation(id: id, parentId: parentId)
        case .deleteLocation(let id): try deleteLocation(id: id)
        case .revertEvent(let seq, _, let entityId): try revertEvent(seq: seq, entityId: entityId)
        default: preconditionFailure("every other case is covered by runItemWrite/runItemAux")
        }
    }
}
