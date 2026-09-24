import AppCore

/// How an open repair reads on the item it is about: the approved one-line
/// problem ("Moved on iPad too") and the one choice that keeps this phone's
/// change. The full choice of both sides is the Sync page's; this is only the
/// notice and its shortcut.
internal enum InventoryDetailConflicts {
    /// `catalogue` is the repair read against the current fields, for a
    /// `catalogueChanged` repair's problem line.
    internal static func conflict(
        _ repair: InventoryRepair, catalogue: InventoryCatalogueRepairDetail? = nil
    ) -> InventoryDetailConflict {
        let elsewhere = otherSide(of: repair)
        switch repair.kind {
        case .conflict:
            let (verb, noun) = words(for: repair.field)
            return InventoryDetailConflict(
                repairId: repair.id, problem: "\(verb) on \(elsewhere) too",
                resolution: "Keep this phone's \(noun)", choice: .keepMine())
        case .codeCollision:
            return InventoryDetailConflict(
                repairId: repair.id, problem: "That code is already used",
                resolution: repair.suggestedCode.map { "Use \($0)" },
                choice: .keepMine(code: repair.suggestedCode))
        case .deletedElsewhere:
            return InventoryDetailConflict(
                repairId: repair.id, problem: "Deleted on \(elsewhere)", resolution: "Restore",
                choice: .keepMine())
        case .photoFailed:
            return InventoryDetailConflict(
                repairId: repair.id, problem: "A photo did not upload", resolution: "Retry",
                choice: .keepMine())
        case .catalogueChanged:
            let problem = catalogue.map { "\($0.title): \($0.problem)" }
            return InventoryDetailConflict(
                repairId: repair.id, problem: problem ?? "A field in a queued change was replaced",
                resolution: repair.kind.fix.title, choice: .keepMine(), opensRepair: true)
        case .unrecognised(let reason):
            return InventoryDetailConflict(
                repairId: repair.id,
                problem: reason == "invalid" || reason == "type_unknown"
                    ? "A queued value no longer matches the catalogue"
                    : "The server rejected a queued change",
                resolution: nil, choice: .keepMine())
        }
    }

    /// The other side of the disagreement: the second option, since a
    /// repair lists this phone's first.
    private static func otherSide(of repair: InventoryRepair) -> String {
        repair.options.dropFirst().first?.source.inSentence ?? "another device"
    }

    private static func words(for field: String?) -> (verb: String, noun: String) {
        switch field {
        case "placement": ("Moved", "placement")
        case "name": ("Renamed", "name")
        default: ("Changed", "change")
        }
    }
}
