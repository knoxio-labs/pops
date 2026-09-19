import AppCore

/// What one mutation-log row replays: a command a person issued, or the Undo
/// of one this phone has already sent. The second has no `InventoryCommand`
/// of its own until the sent one's outcome names the server event to revert,
/// so the log keeps it as a reference to that mutation instead.
internal enum LoggedCommand: Equatable, Sendable {
    case command(InventoryCommand)
    case undo(of: String)

    var entityKind: InventoryEntityKind? {
        guard case .command(let command) = self else { return nil }
        return command.entityKind
    }
}

/// `InventoryCommand.editItem`'s note patch, stored.
internal enum StoredNoteUpdate: Codable, Equatable {
    case unchanged
    case set(String)
    case cleared
}

/// One key of `InventoryCommand.editItem`'s fields patch, stored: set to a
/// value or removed.
internal enum StoredFieldPatch: Codable, Equatable {
    case set(StoredFieldValue)
    case remove
}

/// `LoggedCommand`'s storage twin, for the log's `command` column.
internal enum StoredCommand: Codable, Equatable {
    case createItem(
        id: String, name: String, typeKey: String?, fields: [String: StoredFieldValue],
        note: String?, externalIds: [StoredExternalIdentifier], quantity: Int,
        placement: StoredPlacement)
    case editItem(
        id: String, name: String?, note: StoredNoteUpdate, fields: [String: StoredFieldPatch],
        externalIds: [StoredExternalIdentifier]?)
    case changeItemType(id: String, typeKey: String, fields: [String: StoredFieldValue])
    case setItemCode(id: String, code: String?)
    case moveItem(id: String, to: StoredPlacement, verb: String)
    case setItemAccess(id: String, access: String)
    case setItemFull(id: String, isFull: Bool)
    case setItemLifecycle(id: String, lifecycle: String, reason: String?)
    case setItemQuantity(id: String, quantity: Int)
    case splitItem(id: String, newItemId: String, quantity: Int)
    case attachPhoto(itemId: String, sha256: String, position: Int)
    case removePhoto(itemId: String, sha256: String)
    case reorderPhotos(itemId: String, sha256s: [String])
    case restoreDeletedItem(id: String)
    case deleteItem(id: String)
    case createLocation(id: String, name: String, parentId: String?, sortOrder: Int)
    case renameLocation(id: String, name: String)
    case moveLocation(id: String, parentId: String?)
    case deleteLocation(id: String)
    case revertEvent(seq: Int, entityKind: String, entityId: String)
    case undo(of: String)
}

extension InventoryMoveVerb {
    init?(wire: String) {
        switch wire {
        case "move": self = .move
        case "pick_up": self = .pickUp
        case "put_back": self = .putBack
        case "store": self = .store
        default: return nil
        }
    }
}
