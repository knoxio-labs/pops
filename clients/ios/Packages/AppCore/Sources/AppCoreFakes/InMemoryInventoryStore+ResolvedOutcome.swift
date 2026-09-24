import AppCore

extension InMemoryInventoryStore {
    /// The resolved row's line, worded as the on-device replica words it:
    /// by what the repair was about, and Let go for an `unrecognised` repair
    /// whichever choice settled it, since it offers nothing to keep.
    static func resolvedOutcome(_ kind: InventoryRepairKind, _ choice: InventoryRepairChoice)
        -> String
    {
        switch (kind, choice) {
        case (.unrecognised, _), (.deletedElsewhere, .discardMine),
            (.catalogueChanged, .discardMine):
            "Let go"
        case (.catalogueChanged, .keepMine), (.catalogueChanged, .replaceMine):
            "Sent with current fields"
        case (.conflict, .keepMine): "Kept mine"
        case (.codeCollision, .keepMine(let code)): code.map { "Relabelled \($0)" } ?? "Relabelled"
        case (.deletedElsewhere, .keepMine): "Restored"
        case (.photoFailed, .keepMine): "Photo retried"
        case (.photoFailed, .discardMine): "Photo removed"
        case (.conflict, .discardMine), (.codeCollision, .discardMine): "Discarded mine"
        case (.conflict, .replaceMine), (.codeCollision, .replaceMine),
            (.deletedElsewhere, .replaceMine), (.photoFailed, .replaceMine):
            "Kept mine"
        }
    }
}
