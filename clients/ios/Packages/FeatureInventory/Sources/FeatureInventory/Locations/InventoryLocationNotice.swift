import AppCore

/// Something pending about a place's own position, said in one line at the
/// top of its page: a move this phone has queued and not yet sent, or a move
/// the server would not take because another device moved the place too.
internal enum InventoryLocationNotice: Equatable, Sendable {
    case queuedMove(to: String)
    case conflictingMove(
        repairId: InventoryRepair.ID, mine: String, theirs: String, device: String)

    /// The field a location's move changes, as a repair names it.
    private static let moveField = "parentId"
    private static let topLevel = "the top level"

    /// The notice for place `id`, read from the sync ledger. An open move
    /// conflict wins over a queued move, because the queued move is the
    /// change the conflict is holding back.
    internal static func query(id: InventoryLocation.ID) -> InventoryQuery<InventoryLocationNotice?>
    {
        InventoryQuery { notice(for: id, reading: $0) }
    }

    internal static func notice(
        for id: InventoryLocation.ID, reading source: any InventoryQuerySource
    ) -> InventoryLocationNotice? {
        let ledger = source.inventorySyncLedger()
        let name = { (value: String?) in placeName(value, source: source) }
        if let repair = ledger.repairs.first(where: { isMoveConflict($0, on: id) }) {
            let theirs = repair.options.dropFirst().first
            return .conflictingMove(
                repairId: repair.id, mine: name(repair.options.first?.value),
                theirs: name(theirs?.value),
                device: theirs?.source.inSentence ?? "another device")
        }
        let queued = ledger.waiting.last { mutation in
            if case .moveLocation(id, _) = mutation.command { return true }
            return false
        }
        if case .moveLocation(_, let parentId)? = queued?.command {
            return .queuedMove(to: name(parentId))
        }
        return nil
    }

    private static func isMoveConflict(_ repair: InventoryRepair, on id: InventoryLocation.ID)
        -> Bool
    {
        repair.entityKind == .location && repair.entityId == id && repair.kind == .conflict
            && repair.field == moveField
    }

    /// A parent as a person reads it: the place's name, the top level for
    /// no parent, and the value itself for a place this phone has not seen.
    private static func placeName(_ value: String?, source: any InventoryQuerySource) -> String {
        guard let value, !value.isEmpty, value != "null" else { return topLevel }
        return source.inventoryLocation(id: value)?.name ?? value
    }
}
