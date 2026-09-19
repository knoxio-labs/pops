import AppCore

/// How a repair was settled: the `repair.resolution` column, and the line
/// the Sync page's resolved list shows for it.
internal enum RepairResolution: String {
    case keptMine = "kept_mine"
    case relabelled
    case restored
    case retried
    case discardedMine = "discarded_mine"
    case letGo = "let_go"
    case removed
    case resolvedElsewhere = "resolved_elsewhere"

    /// Letting go of this phone's side, worded for what the repair was about.
    static func lettingGo(_ kind: StoredRepairKind) -> Self {
        switch kind {
        case .field, .codeCollision: .discardedMine
        case .deleted, .rejected: .letGo
        case .photoFailed: .removed
        }
    }

    /// `code` is the one a relabel settled on.
    func line(code: String? = nil) -> String {
        switch self {
        case .keptMine: "Kept mine"
        case .relabelled: code.map { "Relabelled \($0)" } ?? "Relabelled"
        case .restored: "Restored"
        case .retried: "Photo retried"
        case .discardedMine: "Discarded mine"
        case .letGo: "Let go"
        case .removed: "Photo removed"
        case .resolvedElsewhere: "Already resolved elsewhere"
        }
    }

    /// An `applied` outcome with `converged: true`: this phone and another
    /// source set the same value (the approved "Same count on both").
    static func convergedLine(for command: LoggedCommand) -> String {
        guard case .command(let command) = command else { return "Same change on both" }
        return "Same \(convergedNoun(for: command)) on both"
    }

    private static func convergedNoun(for command: InventoryCommand) -> String {
        switch command {
        case .moveItem, .moveLocation: "place"
        case .setItemQuantity: "count"
        case .editItem: "details"
        case .renameLocation: "name"
        case .setItemCode: "code"
        case .changeItemType: "type"
        case .setItemLifecycle: "status"
        case .setItemAccess, .setItemFull: "state"
        default: "change"
        }
    }
}
