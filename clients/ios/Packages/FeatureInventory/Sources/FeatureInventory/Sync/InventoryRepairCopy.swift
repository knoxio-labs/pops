import AppCore

/// The words and glyph a repair shows, kept beside the screens that draw
/// them rather than on `AppCore`'s `InventoryRepairKind`: the domain type
/// names what happened, and only this feature decides how to say it.
///
/// `unrecognised` (D10: the wire can name an outcome kind this build has
/// never seen) falls back to the same one-line notice every open question's
/// default repair uses (ADR-002, "no approved repair kind covers it"): only
/// "Let go".
extension InventoryRepairKind {
    /// The row's one inline fix: its label and glyph.
    internal var fix: (title: String, symbol: InventorySymbol) {
        switch self {
        case .conflict: ("Keep mine", InventorySymbol.device)
        case .codeCollision: ("New code", .suggest)
        case .deletedElsewhere: ("Restore", .restore)
        case .photoFailed, .catalogueChanged: ("Retry", .retry)
        case .unrecognised: ("Let go", .attention)
        }
    }

    /// The repair screen's keep-mine commit, or nil when there is none
    /// (`unrecognised` offers only Let go).
    internal var keepTitle: String? {
        switch self {
        case .conflict: "Keep"
        case .codeCollision: "Save"
        case .deletedElsewhere: "Restore"
        case .photoFailed, .catalogueChanged: "Retry"
        case .unrecognised: nil
        }
    }

    internal var letGoTitle: String {
        switch self {
        case .conflict, .codeCollision: "Discard mine"
        case .deletedElsewhere, .catalogueChanged: "Let go"
        case .photoFailed: "Remove"
        case .unrecognised: "Let go"
        }
    }

    /// What keeping this phone's side says happened, for the undo capsule
    /// and the resolved row. `codeCollision` says something more specific
    /// (the code that was saved) at the call site instead.
    internal var keepOutcome: String {
        switch self {
        case .conflict: "Kept mine"
        case .codeCollision: "Relabelled"
        case .deletedElsewhere: "Restored"
        case .photoFailed: "Photo sent"
        case .catalogueChanged: "Sent with current fields"
        case .unrecognised: "Kept mine"
        }
    }

    internal var letGoOutcome: String {
        switch self {
        case .conflict, .codeCollision: "Discarded mine"
        case .deletedElsewhere, .catalogueChanged: "Let go"
        case .photoFailed: "Photo removed"
        case .unrecognised: "Let go"
        }
    }
}
