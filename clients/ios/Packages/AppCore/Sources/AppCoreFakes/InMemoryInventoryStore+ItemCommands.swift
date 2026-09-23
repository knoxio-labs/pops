import AppCore
import Foundation

/// Item-command application for `InMemoryInventoryStore`. Split from the
/// dispatcher in the main file, and split again into two groups here, purely
/// to keep every switch's cyclomatic complexity readable — each function
/// below still does exactly what the corresponding line of the single
/// switch it replaced did.
extension InMemoryInventoryStore {
    static func applyItemGroupA(
        _ command: InventoryCommand, mutationId: String, into state: inout State
    ) throws {
        switch command {
        case .createItem(let new):
            try applyCreateItem(new, mutationId: mutationId, into: &state)
        case .createProtocol2Item(let new):
            try applyCreateProtocol2Item(new, mutationId: mutationId, into: &state)
        case .editItem(let id, let name, let note, let fields, let externalIds):
            try applyEditItem(
                id: id,
                edit: ItemEdit(name: name, note: note, fields: fields, externalIds: externalIds),
                mutationId: mutationId, into: &state)
        case .editProtocol2Item(let id, let catalogueRevision, let values):
            try applyEditProtocol2Item(
                id: id, catalogueRevision: catalogueRevision, values: values,
                mutationId: mutationId, into: &state)
        case .changeItemType(let id, let typeKey, let fields):
            try applyChangeItemType(
                id: id, typeKey: typeKey, fields: fields, mutationId: mutationId, into: &state)
        case .changeProtocol2ItemType(let id, let catalogueRevision, let typeId, let values):
            try applyChangeProtocol2ItemType(
                id: id,
                change: Protocol2TypeChange(
                    catalogueRevision: catalogueRevision, typeId: typeId, values: values),
                mutationId: mutationId, into: &state)
        case .setItemCode(let id, let code):
            try applySetItemCode(id: id, code: code, mutationId: mutationId, into: &state)
        case .moveItem(let id, let to, let verb):
            try applyMoveItem(id: id, to: to, verb: verb, mutationId: mutationId, into: &state)
        default:
            throw RepositoryError.contractMismatch
        }
    }

    static func applyItemGroupB(
        _ command: InventoryCommand, mutationId: String, into state: inout State
    ) throws {
        switch command {
        case .setItemAccess(let id, let access):
            try applySetItemAccess(id: id, access: access, mutationId: mutationId, into: &state)
        case .setItemFull(let id, let isFull):
            try applySetItemFull(id: id, isFull: isFull, mutationId: mutationId, into: &state)
        case .setItemLifecycle(let id, let lifecycle, let reason):
            try applySetItemLifecycle(
                id: id, lifecycle: lifecycle, reason: reason, mutationId: mutationId,
                into: &state)
        case .setItemQuantity(let id, let quantity):
            try applySetItemQuantity(
                id: id, quantity: quantity, mutationId: mutationId, into: &state)
        case .splitItem(let id, let newItemId, let quantity):
            try applySplitItem(
                id: id, newItemId: newItemId, quantity: quantity, mutationId: mutationId,
                into: &state)
        case .attachPhoto(let id, let sha256, let position):
            try applyAttachPhoto(
                itemId: id, sha256: sha256, position: position, mutationId: mutationId,
                into: &state)
        case .removePhoto(let id, let sha256):
            try applyRemovePhoto(itemId: id, sha256: sha256, mutationId: mutationId, into: &state)
        case .reorderPhotos(let id, let sha256s):
            try applyReorderPhotos(
                itemId: id, sha256s: sha256s, mutationId: mutationId, into: &state)
        case .restoreDeletedItem(let id):
            try applyRestoreDeletedItem(id: id, mutationId: mutationId, into: &state)
        case .deleteItem(let id):
            try applyDeleteItem(id: id, mutationId: mutationId, into: &state)
        default:
            throw RepositoryError.contractMismatch
        }
    }

    private static func applyCreateItem(
        _ new: InventoryNewItem, mutationId: String, into state: inout State
    ) throws {
        guard state.items[new.id] == nil else { throw RepositoryError.contractMismatch }
        let type = new.typeKey.flatMap { state.catalogue.type(forKey: $0) }
        let isContainer = type?.isContainer ?? false
        let now = Date()
        let item = InventoryItem(
            id: new.id, revision: 1, seq: state.nextSeq, name: new.name, typeKey: new.typeKey,
            fields: new.fields, note: new.note, externalIds: new.externalIds,
            quantity: InventoryQuantity(count: new.quantity), placement: new.placement,
            containment: isContainer ? InventoryContainment(access: .open, isFull: false) : nil,
            createdAt: now, updatedAt: now)
        state.nextSeq += 1
        state.items[new.id] = item
        state.undoLog[mutationId] = .item(nil)
    }

    private static func applyEditItem(
        id: InventoryItem.ID, edit: ItemEdit, mutationId: String, into state: inout State
    ) throws {
        let item = try require(state.items[id])
        var updatedFields = item.fields
        for (key, value) in edit.fields { updatedFields[key] = value }
        let updatedNote: String?
        switch edit.note {
        case .unchanged: updatedNote = item.note
        case .set(let value): updatedNote = value
        case .cleared: updatedNote = nil
        }
        state.undoLog[mutationId] = .item(item)
        state.items[id] = bumped(
            item, seq: &state.nextSeq,
            name: edit.name.map { FieldPatch.set($0) } ?? .unchanged, note: .set(updatedNote),
            fields: .set(updatedFields),
            externalIds: edit.externalIds.map { .set($0) } ?? .unchanged)
    }

    private static func applyChangeItemType(
        id: InventoryItem.ID, typeKey: String, fields: [String: InventoryFieldValue],
        mutationId: String, into state: inout State
    ) throws {
        let item = try require(state.items[id])
        let isContainer = state.catalogue.type(forKey: typeKey)?.isContainer ?? false
        if item.isContainer && !isContainer {
            let hasContents = state.items.values.contains { $0.placement == .container(id) }
            if hasContents { throw RepositoryError.contractMismatch }
        }
        state.undoLog[mutationId] = .item(item)
        let bumpedItem = bumped(item, seq: &state.nextSeq, fields: .set(fields))
        state.items[id] = retyped(bumpedItem, typeKey: typeKey, isContainer: isContainer)
    }

    private static func applySetItemCode(
        id: InventoryItem.ID, code: String?, mutationId: String, into state: inout State
    ) throws {
        let item = try require(state.items[id])
        if let code {
            let collision = state.items.values.contains {
                $0.id != id && $0.code?.caseInsensitiveCompare(code) == .orderedSame
            }
            if collision { throw RepositoryError.contractMismatch }
        }
        state.undoLog[mutationId] = .item(item)
        state.items[id] = bumped(item, seq: &state.nextSeq, code: .set(code))
    }

    private static func applyMoveItem(
        id: InventoryItem.ID, to: InventoryPlacement, verb: InventoryMoveVerb, mutationId: String,
        into state: inout State
    ) throws {
        let item = try require(state.items[id])
        if case .container(let containerId) = to {
            guard containerId != id else { throw RepositoryError.contractMismatch }
            guard let container = state.items[containerId], container.isContainer else {
                throw RepositoryError.contractMismatch
            }
        }
        state.undoLog[mutationId] = .item(item)
        state.items[id] = bumped(item, seq: &state.nextSeq, placement: .set(to))
    }

    private static func applySetItemAccess(
        id: InventoryItem.ID, access: InventoryAccess, mutationId: String, into state: inout State
    ) throws {
        let item = try require(state.items[id])
        guard let containment = item.containment else { throw RepositoryError.contractMismatch }
        state.undoLog[mutationId] = .item(item)
        state.items[id] = bumped(
            item, seq: &state.nextSeq,
            containment: .set(InventoryContainment(access: access, isFull: containment.isFull)))
    }

    private static func applySetItemFull(
        id: InventoryItem.ID, isFull: Bool, mutationId: String, into state: inout State
    ) throws {
        let item = try require(state.items[id])
        guard let containment = item.containment else { throw RepositoryError.contractMismatch }
        state.undoLog[mutationId] = .item(item)
        state.items[id] = bumped(
            item, seq: &state.nextSeq,
            containment: .set(InventoryContainment(access: containment.access, isFull: isFull)))
    }

    private static func applySetItemLifecycle(
        id: InventoryItem.ID, lifecycle: InventoryLifecycle, reason: InventoryDiscardReason?,
        mutationId: String, into state: inout State
    ) throws {
        let item = try require(state.items[id])
        guard item.lifecycle != .destroyed else { throw RepositoryError.contractMismatch }
        state.undoLog[mutationId] = .item(item)
        state.items[id] = bumped(
            item, seq: &state.nextSeq, lifecycle: .set(lifecycle), lifecycleChangedAt: .set(Date()))
    }

    private static func applySetItemQuantity(
        id: InventoryItem.ID, quantity: Int, mutationId: String, into state: inout State
    ) throws {
        guard quantity >= 1 else { throw RepositoryError.contractMismatch }
        let item = try require(state.items[id])
        state.undoLog[mutationId] = .item(item)
        state.items[id] = bumped(
            item, seq: &state.nextSeq, quantity: .set(InventoryQuantity(count: quantity)))
    }

    private static func applySplitItem(
        id: InventoryItem.ID, newItemId: InventoryItem.ID, quantity: Int, mutationId: String,
        into state: inout State
    ) throws {
        let item = try require(state.items[id])
        guard quantity >= 1, quantity < item.quantity.count else {
            throw RepositoryError.contractMismatch
        }
        guard state.items[newItemId] == nil else { throw RepositoryError.contractMismatch }
        let now = Date()
        state.undoLog[mutationId] = .item(item)
        state.items[id] = bumped(
            item, seq: &state.nextSeq,
            quantity: .set(InventoryQuantity(count: item.quantity.count - quantity)))
        state.nextSeq += 1
        state.items[newItemId] = InventoryItem(
            id: newItemId, revision: 1, seq: state.nextSeq, name: item.name,
            typeKey: item.typeKey, fields: item.fields, note: item.note,
            quantity: InventoryQuantity(count: quantity), placement: item.placement,
            createdAt: now, updatedAt: now)
    }

    private static func applyAttachPhoto(
        itemId: InventoryItem.ID, sha256: String, position: Int, mutationId: String,
        into state: inout State
    ) throws {
        let item = try require(state.items[itemId])
        var photos = item.photos
        photos.insert(
            InventoryPhotoReference(sha256: sha256, caption: nil), at: min(position, photos.count))
        state.undoLog[mutationId] = .item(item)
        state.items[itemId] = bumped(item, seq: &state.nextSeq, photos: .set(photos))
    }

    private static func applyRemovePhoto(
        itemId: InventoryItem.ID, sha256: String, mutationId: String, into state: inout State
    ) throws {
        let item = try require(state.items[itemId])
        state.undoLog[mutationId] = .item(item)
        state.items[itemId] = bumped(
            item, seq: &state.nextSeq, photos: .set(item.photos.filter { $0.sha256 != sha256 }))
    }

    private static func applyReorderPhotos(
        itemId: InventoryItem.ID, sha256s: [String], mutationId: String, into state: inout State
    ) throws {
        let item = try require(state.items[itemId])
        let bySha = Dictionary(uniqueKeysWithValues: item.photos.map { ($0.sha256, $0) })
        state.undoLog[mutationId] = .item(item)
        state.items[itemId] = bumped(
            item, seq: &state.nextSeq, photos: .set(sha256s.compactMap { bySha[$0] }))
    }

    private static func applyRestoreDeletedItem(
        id: InventoryItem.ID, mutationId: String, into state: inout State
    ) throws {
        let item = try require(state.items[id])
        guard item.isDeleted else { throw RepositoryError.contractMismatch }
        state.undoLog[mutationId] = .item(item)
        state.items[id] = bumped(item, seq: &state.nextSeq, deletedAt: .set(nil))
    }
}
