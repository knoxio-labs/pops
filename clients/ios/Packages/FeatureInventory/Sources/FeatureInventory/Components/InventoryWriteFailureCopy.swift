import AppCore

extension InventoryCopy {
    /// Why a write or an Undo did not land: who won a conflict, which code is
    /// taken, or what the server refused, in one short sentence. Never the
    /// server's own diagnostic `message`, which is written for a log.
    ///
    /// `.storageFull` answers with the Storage full alert's own message. No
    /// screen shows it through the one-line alert: `inventoryWriteFailureAlerts`
    /// routes it to `inventoryStorageFullAlert`, the same approved alert the
    /// Sync page shows, before this function is ever called.
    internal static func message(for failure: InventoryWriteFailure) -> String {
        switch failure {
        case .repository(let error): message(for: error)
        case .command(let error): message(for: error)
        case .storageFull: storageFullMessage
        }
    }

    private static func message(for error: InventoryCommandError) -> String {
        switch error {
        case .fieldConflict(let field, _, _, let source, _, _):
            "\(fieldName(field)) was changed on \(source.inSentence) first, so nothing changed here."
        case .codeCollision(_, let heldByName, let suggestedCode):
            "That code is already on \(heldByName). \(suggestedCode) is free."
        case .deletedElsewhere(let source, _):
            "This was deleted on \(source.inSentence), so nothing changed."
        case .rejected(let reason, _):
            message(for: reason)
        case .nothingToUndo:
            "There is nothing left to undo."
        case .repairNotFound:
            "That was already settled."
        }
    }

    private static func message(for reason: InventoryRejectedReason) -> String {
        switch reason {
        case .cycle: "That would put it inside itself, so nothing changed."
        case .targetMissing: "That place no longer exists, so nothing changed."
        case .notContainer: "Things cannot go in that, so nothing changed."
        case .hasContents: "It still has things in it, so nothing changed."
        case .illegalTransition: "It cannot go from where it is now to that, so nothing changed."
        case .typeUnknown: "This build does not know that type yet, so nothing changed."
        case .mediaMissing: "A photo did not finish uploading, so nothing changed."
        case .invalid, .unrecognised: "The server would not take that change. Nothing changed."
        }
    }

    private static func fieldName(_ field: String) -> String {
        let words = field.replacingOccurrences(of: "_", with: " ")
        return words.prefix(1).uppercased() + words.dropFirst()
    }
}

extension InventorySyncSource {
    /// Where the other side of a disagreement happened, as a sentence names
    /// it: "changed on Joao's iPad first", "deleted on the server".
    internal var inSentence: String {
        switch self {
        case .thisDevice: "this phone"
        case .otherDevice(let label), .unrecognised(_, let label): label
        case .web, .service: "the server"
        }
    }
}
